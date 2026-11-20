/**
 * Test-data helpers: people, elections, ballots. Every name and email carries a per-run tag so runs never collide and
 * no test depends on earlier state. Ballots are never deletable by design, so nothing here tries to clean them up.
 */

import { randomBytes } from 'node:crypto';
import { UserInfo } from '@memberjunction/core';
import { type mjBizAppsCommonPersonEntity } from '@mj-biz-apps/common-entities';
import {
    type VotingBallotSubmission,
    type VotingContestSpec,
    type VotingCreateElectionInput,
    type mjBizAppsVotingEligibleVoterEntity,
    type mjBizAppsVotingElectionEntity,
} from '@mj-biz-apps/voting-entities';
import {
    BallotStyleBuilder,
    CastEngine,
    ElectionAdministrationEngine,
    LoadElectionGraph,
    VoterRollEngine,
    type VotingContext,
} from '@mj-biz-apps/voting-server';
import { type BallotStyle } from '@mj-biz-apps/voting-entities';
import { type Harness } from './harness.js';

export const RUN_TAG = randomBytes(4).toString('hex');
const PEOPLE = 'MJ_BizApps_Common: People';
const ELECTIONS = 'MJ_BizApps_Voting: Elections';
const VOTERS = 'MJ_BizApps_Voting: Eligible Voters';

let personCounter = 0;

/** Throws with the engine's own code and message when a result failed; returns the value otherwise. */
export function Must<T>(result: { Success: true; Value: T } | { Success: false; Code: string; ErrorMessage: string }, what: string): T {
    if (result.Success === true) return result.Value;
    const failure = result as { Code: string; ErrorMessage: string };
    throw new Error(`${what} failed: ${failure.Code}: ${failure.ErrorMessage}`);
}

export interface TestPerson {
    ID: string;
    Email: string;
}

export async function CreatePerson(h: Harness, label: string): Promise<TestPerson> {
    const person = await h.Provider.GetEntityObject<mjBizAppsCommonPersonEntity>(PEOPLE, h.System);
    person.NewRecord();
    person.FirstName = `IT-${label}`;
    person.LastName = `Voter${++personCounter}`;
    person.Email = `vt-${RUN_TAG}-${label}-${personCounter}@voting-it.invalid`;
    person.Status = 'Active';
    if (!(await person.Save())) throw new Error(`Could not create test person: ${person.LatestResult?.CompleteMessage}`);
    return { ID: person.ID, Email: person.Email };
}

export async function CreatePeople(h: Harness, count: number, label = 'p'): Promise<TestPerson[]> {
    const out: TestPerson[] = [];
    for (let i = 0; i < count; i++) out.push(await CreatePerson(h, label));
    return out;
}

/**
 * A copy of a cached user carrying a different email; never saved anywhere. Engines that resolve "the Person behind the
 * acting user" (certification, trustee shares) match on this email.
 */
export function Persona(base: UserInfo, email: string): UserInfo {
    const user = new UserInfo();
    Object.assign(user, base);
    user.Email = email;
    return user;
}

export function MotionContest(name = 'Adopt the resolution'): VotingContestSpec {
    return { Name: name, Kind: 'Motion', TallyMethodCode: 'majority', Threshold: 'Majority', Options: [{ Label: 'Yes' }, { Label: 'No' }] };
}

export function QuestionContest(name = 'Approve the proposal'): VotingContestSpec {
    return { Name: name, Kind: 'Question', TallyMethodCode: 'majority', Threshold: 'Majority', Options: [{ Label: 'Yes' }, { Label: 'No' }] };
}

export interface ElectionSpec {
    Type?: string;
    Name?: string;
    Voters: TestPerson[];
    Contests?: VotingContestSpec[];
    Overrides?: Partial<VotingCreateElectionInput>;
}

/** Creates a Draft election whose roll is an inline CSV of the given people. */
export async function CreateDraft(h: Harness, spec: ElectionSpec): Promise<string> {
    const input: VotingCreateElectionInput = {
        ElectionTypeCode: spec.Type ?? 'motion',
        Name: spec.Name ?? `IT ${RUN_TAG} ${randomBytes(3).toString('hex')}`,
        EligibilitySource: { Code: 'csv', Settings: { Rows: spec.Voters.map((v, i) => ({ Email: v.Email, SourceKey: `k${i}`, Weight: 1 })) } },
        Contests: spec.Contests ?? [MotionContest()],
        ...spec.Overrides,
    };
    return Must(await ElectionAdministrationEngine.Instance.CreateElection(input, h.Ctx), 'CreateElection').ElectionID;
}

/** Create, freeze the roll, open. */
export async function CreateOpenElection(h: Harness, spec: ElectionSpec): Promise<string> {
    const id = await CreateDraft(h, spec);
    Must(await VoterRollEngine.Instance.FreezeRoll(id, h.Ctx), 'FreezeRoll');
    Must(await ElectionAdministrationEngine.Instance.OpenElection(id, h.Ctx), 'OpenElection');
    return id;
}

/** A context for the same provider acting as `user`. */
export function As(h: Harness, user: UserInfo): VotingContext {
    return { ContextUser: user, Provider: h.Ctx.Provider };
}

export async function LoadElection(h: Harness, electionID: string): Promise<mjBizAppsVotingElectionEntity> {
    const election = await h.Provider.GetEntityObject<mjBizAppsVotingElectionEntity>(ELECTIONS, h.System);
    if (!(await election.Load(electionID))) throw new Error('election not found');
    return election;
}

export interface RollVoter {
    EligibleVoterID: string;
    PersonID: string;
}

export async function LoadRoll(h: Harness, electionID: string): Promise<RollVoter[]> {
    const res = await h.Provider.RunView<mjBizAppsVotingEligibleVoterEntity>(
        { EntityName: VOTERS, ExtraFilter: `ElectionID = '${electionID}'`, ResultType: 'entity_object' },
        h.System
    );
    if (!res.Success) throw new Error('could not read roll');
    return res.Results.map((v) => ({ EligibleVoterID: v.ID, PersonID: v.PersonID }));
}

/** The ballot style the given voter is shown. */
export async function StyleFor(h: Harness, electionID: string, eligibleVoterID: string): Promise<BallotStyle> {
    const graph = Must(await LoadElectionGraph(electionID, h.Ctx), 'LoadElectionGraph');
    const voter = Must(await VoterRollEngine.Instance.GetVoter(eligibleVoterID, h.Ctx), 'GetVoter');
    return BallotStyleBuilder.Instance.Build(graph, voter.VotingClass, 'en', h.Ctx);
}

/** Picks option `optionIndex` (0-based) of every single-choice contest. */
export function PickOption(style: BallotStyle, optionIndex: number): VotingBallotSubmission {
    return {
        Contests: style.Contests.map((c) => ({ ContestID: c.ContestID, Selections: [{ OptionID: c.Options[optionIndex].OptionID }] })),
    };
}

export interface CastOutcome {
    Success: boolean;
    Code?: string;
    Message?: string;
    ReceiptCode?: string;
}

/** Casts online as `eligibleVoterID`, choosing `optionIndex` in every contest. */
export async function CastVote(
    h: Harness,
    electionID: string,
    eligibleVoterID: string,
    optionIndex: number,
    overrides: { BallotStyleHash?: string; Channel?: 'Online' | 'Paper' | 'InPerson' | 'Proxy'; Ctx?: VotingContext } = {}
): Promise<CastOutcome> {
    const style = await StyleFor(h, electionID, eligibleVoterID);
    const res = await CastEngine.Instance.Cast(
        {
            ElectionID: electionID,
            EligibleVoterID: eligibleVoterID,
            BallotStyleHash: overrides.BallotStyleHash ?? style.Hash,
            Submission: PickOption(style, optionIndex),
            Channel: (overrides.Channel ?? 'Online') as 'Online',
        },
        overrides.Ctx ?? h.Ctx
    );
    return res.Success === true ? { Success: true, ReceiptCode: res.Value.ReceiptCode } : { Success: false, Code: (res as { Code: string }).Code, Message: (res as { ErrorMessage: string }).ErrorMessage };
}

/** One scalar from a query. */
export async function Scalar<T>(h: Harness, query: string, params: Record<string, string> = {}): Promise<T> {
    const request = h.Pool.request();
    for (const [k, v] of Object.entries(params)) request.input(k, v);
    const res = await request.query(query);
    return Object.values(res.recordset[0])[0] as T;
}

export async function Rows<T>(h: Harness, query: string, params: Record<string, string> = {}): Promise<T[]> {
    const request = h.Pool.request();
    for (const [k, v] of Object.entries(params)) request.input(k, v);
    return (await request.query(query)).recordset as T[];
}

/** The schema that holds the voting tables (resolved from the catalog, never assumed). */
let schemaPromise: Promise<string> | null = null;
export function VotingSchema(h: Harness): Promise<string> {
    schemaPromise ??= Scalar<string>(h, `SELECT TOP 1 TABLE_SCHEMA FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'CastBallot'`);
    return schemaPromise;
}

/** Saves an entity; returns whether it was saved and the reason when it was not (a refusal may be a false return or a throw). */
export async function TrySave(entity: { Save(): Promise<boolean>; LatestResult?: { CompleteMessage?: string } | null }): Promise<{ Saved: boolean; Message: string }> {
    try {
        const saved = await entity.Save();
        return { Saved: saved, Message: saved ? '' : (entity.LatestResult?.CompleteMessage ?? '') };
    } catch (e) {
        return { Saved: false, Message: e instanceof Error ? e.message : String(e) };
    }
}
