/**
 * Adversarial-tier world builder and voting helpers (client-safe: only the wire client and the browser-safe packages).
 *
 * Differs from `election-world.ts` (which stays the smoke tier's builder) by letting a check choose the secrecy mode, the
 * results policy, the contests, the distribution's allowed origins/methods and, for the volume tier, a roll of arbitrary
 * generated people rather than only the provisioned personas. Everything is created over the wire exactly as an
 * administrator would (Remote Operations plus one Ballot Distribution save).
 */
import { randomBytes, randomUUID } from 'node:crypto';
import type { RemoteOpResult } from '@memberjunction/core';
import type { mjBizAppsCommonPersonEntity } from '@mj-biz-apps/common-entities';
import {
    VotingCastBallotOperation,
    VotingCloseElectionOperation,
    VotingCreateElectionOperation,
    VotingFreezeRollOperation,
    VotingGetMyBallotOperation,
    VotingIssueSecondFactorPinsOperation,
    VotingOpenElectionOperation,
    type VotingBallotStyle,
    type VotingAssuranceTier,
    type VotingBallotSubmission,
    type VotingContestSpec,
    type VotingResultsAudience,
    type VotingResultsTiming,
    type VotingSecrecyMode,
    type mjBizAppsVotingBallotDistributionEntity,
} from '@mj-biz-apps/voting-entities';
import { MotionContest, MustSucceed } from './election-world.js';
import { GetGuestSession } from './guest-session.js';
import type { PersonaKey } from './persona-model.js';
import type { WireCast } from './wire-cast.js';
import { WireClient } from './wire-client.js';

const DISTRIBUTIONS = 'MJ_BizApps_Voting: Ballot Distributions';
const ELIGIBLE_VOTERS = 'MJ_BizApps_Voting: Eligible Voters';
const PEOPLE = 'MJ_BizApps_Common: People';

/** A voter on a built election: how to sign in at the edge and who they are in the roll. */
export interface WorldVoter {
    /** Persona key or generated e-mail: the label a check uses to talk about this voter. */
    Label: string;
    Email: string;
    PersonID: string;
    EligibleVoterID: string;
    SourceKey: string;
    Pin: string;
}

export interface WorldElection {
    ElectionID: string;
    Name: string;
    Slug: string;
    RunTag: string;
    Voters: Map<string, WorldVoter>;
}

export interface PersonRef {
    Label: string;
    Email: string;
    PersonID: string;
}

export interface BuildWorldOptions {
    /** Persona keys and/or generated people to put on the roll. */
    Voters: Array<PersonaKey | PersonRef>;
    Name?: string;
    Contests?: VotingContestSpec[];
    SecrecyMode?: VotingSecrecyMode;
    ResultsTiming?: VotingResultsTiming;
    ResultsAudience?: VotingResultsAudience;
    ElectionTypeCode?: string;
    AssuranceTier?: VotingAssuranceTier;
    /** Stop right after CreateElection: the election stays a Draft (no freeze, distribution, open). */
    DraftOnly?: boolean;
    /** Runs after the roll is frozen and before the election opens (tier B trustee ceremonies happen here). */
    AfterFreeze?: (electionID: string) => Promise<void>;
    /** Distribution AllowedOrigins (JSON array text is written). */
    AllowedOrigins?: string[];
    /** Open the election and issue PINs (default true). When false the election stops after the distribution is saved. */
    Open?: boolean;
    /** Distinguishing prefix for the generated slug (default `wire`). */
    SlugPrefix?: string;
}

/** `adv-<8 hex>`: marks every row an adversarial run creates so a leftover is recognisable. */
export function NewRunTag(prefix = 'adv'): string {
    return `${prefix}-${randomBytes(4).toString('hex')}`;
}

/** Creates `count` roll-eligible people (bizapps-common People) with tagged e-mail addresses, as the system identity. */
export async function CreatePeople(system: WireClient, runTag: string, count: number, parallel = 8): Promise<PersonRef[]> {
    const out: PersonRef[] = new Array<PersonRef>(count);
    let next = 0;
    const worker = async (): Promise<void> => {
        for (;;) {
            const i = next++;
            if (i >= count) return;
            const email = `${runTag}-${i}@voting-wire.test`;
            const person = await system.NewEntity<mjBizAppsCommonPersonEntity>(PEOPLE);
            person.NewRecord();
            person.Email = email;
            person.Status = 'Active';
            person.FirstName = 'Adv';
            person.LastName = `Voter${i}`;
            if (!(await person.Save())) throw new Error(`creating person ${email} failed: ${person.LatestResult?.CompleteMessage ?? 'unknown'}`);
            out[i] = { Label: email, Email: email, PersonID: person.ID };
        }
    };
    await Promise.all(Array.from({ length: Math.min(parallel, count) }, worker));
    return out;
}

/** Creates, freezes, distributes, opens and issues PINs for an election, as `admin`. */
export async function BuildWorldElection(cast: WireCast, admin: WireClient, options: BuildWorldOptions): Promise<WorldElection> {
    const tag = randomBytes(4).toString('hex');
    const runTag = `${options.SlugPrefix ?? 'wire'}-${tag}`;
    const name = options.Name ?? `Adversarial ${runTag}`;
    const refs: PersonRef[] = options.Voters.map((v) =>
        typeof v === 'string' ? { Label: v, Email: cast.Record(v).Email, PersonID: cast.Record(v).PersonID ?? '' } : v
    );
    const rows = refs.map((r, i) => ({ Email: r.Email, SourceKey: `${runTag}-${i}`, Weight: 1 }));

    const created = MustSucceed(
        'Voting.CreateElection',
        await admin.Call(new VotingCreateElectionOperation(), {
            ElectionTypeCode: options.ElectionTypeCode ?? 'motion',
            Name: name,
            EligibilitySource: { Code: 'csv', Settings: { Rows: rows } },
            Contests: options.Contests ?? [MotionContest()],
            ...(options.SecrecyMode ? { SecrecyMode: options.SecrecyMode } : {}),
            ...(options.AssuranceTier ? { AssuranceTier: options.AssuranceTier } : {}),
            ...(options.ResultsTiming ? { ResultsTiming: options.ResultsTiming } : {}),
            ...(options.ResultsAudience ? { ResultsAudience: options.ResultsAudience } : {}),
        })
    );
    const electionID = created.ElectionID as string;
    if (options.DraftOnly) return { ElectionID: electionID, Name: name, Slug: runTag, RunTag: runTag, Voters: new Map() };
    MustSucceed('Voting.FreezeRoll', await admin.Call(new VotingFreezeRollOperation(), { ElectionID: electionID }));
    if (options.AfterFreeze) await options.AfterFreeze(electionID);

    const distribution = await admin.NewEntity<mjBizAppsVotingBallotDistributionEntity>(DISTRIBUTIONS);
    distribution.NewRecord();
    distribution.ElectionID = electionID;
    distribution.Name = `${name} ballot`;
    distribution.Slug = runTag;
    distribution.DistributionKey = `key_${randomBytes(8).toString('hex')}`;
    distribution.Status = 'Active';
    distribution.AllowedCredentialMethods = JSON.stringify(['second-factor']);
    if (options.AllowedOrigins) distribution.AllowedOrigins = JSON.stringify(options.AllowedOrigins);
    if (!(await distribution.Save())) throw new Error(`Ballot Distribution save failed: ${distribution.LatestResult?.CompleteMessage ?? 'unknown'}`);

    const election: WorldElection = { ElectionID: electionID, Name: name, Slug: runTag, RunTag: runTag, Voters: new Map() };
    if (options.Open === false) return election;

    MustSucceed('Voting.OpenElection', await admin.Call(new VotingOpenElectionOperation(), { ElectionID: electionID }));
    const issued = MustSucceed('Voting.IssueSecondFactorPins', await admin.Call(new VotingIssueSecondFactorPinsOperation(), { ElectionID: electionID }));
    const roll = await admin.RunView<{ ID: string; PersonID: string }>({ EntityName: ELIGIBLE_VOTERS, ExtraFilter: `ElectionID = '${electionID}'`, Fields: ['ID', 'PersonID'], ResultType: 'simple' });
    if (!roll.Success) throw new Error(`could not read the roll over the wire: ${roll.ErrorMessage}`);
    const entryByPerson = new Map(roll.Results.map((r) => [r.PersonID.toLowerCase(), r.ID] as const));
    const pinByVoter = new Map((issued.Issued ?? []).map((p) => [p.EligibleVoterID.toLowerCase(), p] as const));
    for (const ref of refs) {
        const entryID = entryByPerson.get(ref.PersonID.toLowerCase());
        const pin = entryID ? pinByVoter.get(entryID.toLowerCase()) : undefined;
        if (!entryID || !pin || !pin.SourceKey) throw new Error(`voter ${ref.Label} is not on the roll or received no PIN`);
        election.Voters.set(ref.Label, { Label: ref.Label, Email: ref.Email, PersonID: ref.PersonID, EligibleVoterID: entryID, SourceKey: pin.SourceKey, Pin: pin.Pin });
    }
    return election;
}

/** Best-effort tidy-up (closes the election so the distribution stops being public). Never throws. */
export async function CloseWorldElection(admin: WireClient, election: WorldElection): Promise<void> {
    try {
        await admin.Call(new VotingCloseElectionOperation(), { ElectionID: election.ElectionID });
    } catch {
        // teardown must not mask the checks' own result
    }
}

// ─── Voting as a guest ───────────────────────────────────────────────────────

export async function GuestFor(election: WorldElection, label: string): Promise<WireClient> {
    const voter = election.Voters.get(label);
    if (!voter) throw new Error(`${label} is not a voter of ${election.Slug}`);
    const session = await GetGuestSession(election.Slug, { SourceKey: voter.SourceKey, Pin: voter.Pin });
    return WireClient.ConnectGuest(`guest-${label}`, session.Token);
}

/** Picks the n-th option (0-based) of the first contest for a single-contest motion/choice ballot. */
export function SubmissionFor(style: VotingBallotStyle, optionIndex: number): VotingBallotSubmission {
    return {
        Contests: style.Contests.map((c) => ({ ContestID: c.ContestID, Selections: [{ OptionID: c.Options[Math.min(optionIndex, c.Options.length - 1)].OptionID }] })),
    };
}

export interface CastOutcome {
    Success: boolean;
    ResultCode: string | undefined;
    Message: string | undefined;
    ReceiptCode: string | undefined;
    /** Wall-clock for the CastBallot call alone. */
    CastMs: number;
    Status: number | undefined;
}

/** GetMyBallot then CastBallot with the same client; `optionIndex` selects which option. Never throws on a refusal. */
export async function CastWith(client: WireClient, electionID: string, optionIndex: number): Promise<CastOutcome> {
    const ballot = await client.Call(new VotingGetMyBallotOperation(), { ElectionID: electionID });
    if (!ballot.Success || !ballot.Output?.Success || !ballot.Output.Style) {
        return { Success: false, ResultCode: ballot.ResultCode, Message: `GetMyBallot: ${ballot.ErrorMessage ?? ballot.Output?.Message ?? 'no style'}`, ReceiptCode: undefined, CastMs: 0, Status: undefined };
    }
    const style = ballot.Output.Style;
    const started = Date.now();
    const res = await client.Call(new VotingCastBallotOperation(), { ElectionID: electionID, BallotStyleHash: style.Hash, Submission: SubmissionFor(style, optionIndex) });
    return OutcomeOf(res, Date.now() - started);
}

export function OutcomeOf(res: RemoteOpResult<{ Success: boolean; Message?: string; ReceiptCode?: string }>, ms: number): CastOutcome {
    return {
        Success: res.Success && res.Output?.Success === true,
        ResultCode: res.ResultCode,
        Message: res.ErrorMessage ?? res.Output?.Message,
        ReceiptCode: res.Output?.ReceiptCode,
        CastMs: ms,
        Status: undefined,
    };
}

/** One line describing any RemoteOpResult, for failure messages. */
export function Describe(res: RemoteOpResult<{ Success: boolean; Message?: string }>): string {
    return `Success=${res.Success} code=${res.ResultCode} err=${res.ErrorMessage ?? '-'} out.Success=${res.Output?.Success} out.Message=${res.Output?.Message ?? '-'}`;
}

/** A well-formed v4 uuid that exists nowhere: the target for operations that must be authorised without touching data. */
export function NoSuchID(): string {
    return randomUUID();
}

export async function Sleep(ms: number): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
}

/** Runs `fn` over `items` with at most `limit` in flight; results keep input order. */
export async function MapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array<R>(items.length);
    let next = 0;
    const worker = async (): Promise<void> => {
        for (;;) {
            const i = next++;
            if (i >= items.length) return;
            out[i] = await fn(items[i], i);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return out;
}
