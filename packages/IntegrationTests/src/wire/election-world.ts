/**
 * Builds an OPEN election entirely over the wire, as an administrator would: every step is a Remote Operation or an entity
 * save made by the admin persona, and every credential comes from the real issuing flow.
 *
 *   Voting.CreateElection (inline CSV roll of the chosen persona emails)
 *   -> Voting.FreezeRoll
 *   -> Ballot Distribution (entity save by the admin)
 *   -> Voting.OpenElection
 *   -> Voting.IssueSecondFactorPins   (the PIN each voter later presents to POST /vote/session)
 */
import { randomBytes } from 'node:crypto';
import {
    VotingCloseElectionOperation,
    VotingCreateElectionOperation,
    VotingFreezeRollOperation,
    VotingIssueSecondFactorPinsOperation,
    VotingOpenElectionOperation,
    type VotingContestSpec,
    type mjBizAppsVotingBallotDistributionEntity,
} from '@mj-biz-apps/voting-entities';
import type { PersonaKey } from './persona-model.js';
import type { WireCast } from './wire-cast.js';
import type { WireClient } from './wire-client.js';

const DISTRIBUTIONS = 'MJ_BizApps_Voting: Ballot Distributions';
const ELIGIBLE_VOTERS = 'MJ_BizApps_Voting: Eligible Voters';

/** Throws with the operation's result code and message unless the call succeeded AND the operation itself reported success. */
export function MustSucceed<TOutput extends { Success: boolean; Message?: string }>(what: string, result: { Success: boolean; ResultCode?: string; ErrorMessage?: string; Output?: TOutput }): TOutput {
    if (!result.Success || !result.Output) throw new Error(`${what} failed over the wire: ${result.ResultCode ?? '?'}: ${result.ErrorMessage ?? 'no output'}`);
    if (!result.Output.Success) throw new Error(`${what} refused: ${result.Output.Message ?? 'no message'}`);
    return result.Output;
}

/** What a voter needs to sign in at the edge. */
export interface VoterSignIn {
    Persona: PersonaKey;
    PersonID: string;
    EligibleVoterID: string;
    SourceKey: string;
    Pin: string;
}

export interface WireElection {
    ElectionID: string;
    Name: string;
    Slug: string;
    Voters: Map<PersonaKey, VoterSignIn>;
}

export function MotionContest(name = 'Adopt the wire resolution'): VotingContestSpec {
    return { Name: name, Kind: 'Motion', TallyMethodCode: 'majority', Threshold: 'Majority', Options: [{ Label: 'Yes' }, { Label: 'No' }] };
}

export interface OpenElectionOptions {
    /** Personas placed on the roll (each must have a Person). */
    Voters: PersonaKey[];
    Name?: string;
    Contests?: VotingContestSpec[];
}

/** Creates, freezes, distributes, opens and issues PINs for a fresh election, acting as `admin`. */
export async function CreateOpenWireElection(cast: WireCast, admin: WireClient, options: OpenElectionOptions): Promise<WireElection> {
    const tag = randomBytes(4).toString('hex');
    const name = options.Name ?? `Wire ${tag}`;
    const rows = options.Voters.map((key, i) => ({ Email: cast.Record(key).Email, SourceKey: `wire-${tag}-${i}`, Weight: 1 }));

    const created = MustSucceed(
        'Voting.CreateElection',
        await admin.Call(new VotingCreateElectionOperation(), {
            ElectionTypeCode: 'motion',
            Name: name,
            EligibilitySource: { Code: 'csv', Settings: { Rows: rows } },
            Contests: options.Contests ?? [MotionContest()],
        })
    );
    const electionID = created.ElectionID as string;
    MustSucceed('Voting.FreezeRoll', await admin.Call(new VotingFreezeRollOperation(), { ElectionID: electionID }));

    const distribution = await admin.NewEntity<mjBizAppsVotingBallotDistributionEntity>(DISTRIBUTIONS);
    distribution.NewRecord();
    distribution.ElectionID = electionID;
    distribution.Name = `${name} ballot`;
    distribution.Slug = `wire-${tag}`;
    distribution.DistributionKey = `key_${randomBytes(8).toString('hex')}`;
    distribution.Status = 'Active';
    distribution.AllowedCredentialMethods = JSON.stringify(['second-factor']);
    if (!(await distribution.Save())) throw new Error(`Ballot Distribution save over the wire failed: ${distribution.LatestResult?.CompleteMessage ?? 'unknown'}`);

    MustSucceed('Voting.OpenElection', await admin.Call(new VotingOpenElectionOperation(), { ElectionID: electionID }));

    const issued = MustSucceed('Voting.IssueSecondFactorPins', await admin.Call(new VotingIssueSecondFactorPinsOperation(), { ElectionID: electionID }));
    const roll = await admin.RunView<{ ID: string; PersonID: string }>({ EntityName: ELIGIBLE_VOTERS, ExtraFilter: `ElectionID = '${electionID}'`, Fields: ['ID', 'PersonID'], ResultType: 'simple' });
    if (!roll.Success) throw new Error(`could not read the roll over the wire: ${roll.ErrorMessage}`);

    const voters = new Map<PersonaKey, VoterSignIn>();
    for (const key of options.Voters) {
        const personID = cast.Record(key).PersonID;
        const entry = roll.Results.find((r) => r.PersonID.toLowerCase() === personID?.toLowerCase());
        const pin = issued.Issued?.find((p) => p.EligibleVoterID.toLowerCase() === entry?.ID.toLowerCase());
        if (!personID || !entry || !pin || !pin.SourceKey) throw new Error(`persona ${key} is not on the roll or received no PIN`);
        voters.set(key, { Persona: key, PersonID: personID, EligibleVoterID: entry.ID, SourceKey: pin.SourceKey, Pin: pin.Pin });
    }
    return { ElectionID: electionID, Name: name, Slug: `wire-${tag}`, Voters: voters };
}

/** Best-effort tidy-up: closes the election so it stops being a public distribution. Never throws. */
export async function CloseWireElection(admin: WireClient, election: WireElection): Promise<void> {
    try {
        await admin.Call(new VotingCloseElectionOperation(), { ElectionID: election.ElectionID });
    } catch {
        // teardown must not mask the checks' own result
    }
}
