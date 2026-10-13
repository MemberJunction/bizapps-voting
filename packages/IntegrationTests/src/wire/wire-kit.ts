/**
 * The wire kit: everything the lifecycle, tally and trustee bundles share, written against Remote Operations only.
 *
 *   - building an election as the admin persona (CreateElection -> FreezeRoll -> distribution -> OpenElection -> PINs),
 *   - voters: a persona with a user API key (an MJ session) or a guest ballot session minted through `POST /vote/session`,
 *   - ballots described by option LABELS ("Yes", "Ada"), turned into submissions from the style the server returns,
 *   - results with option ids translated back to labels so expectations read like the hand-worked fixtures,
 *   - refusal assertions that check the REASON, not just that something failed.
 *
 * CLIENT-SAFE: same rule as wire-client.ts (no voting-server imports).
 */
import { randomBytes } from 'node:crypto';
import type { RemoteOpResult } from '@memberjunction/core';
import { Assert, AssertEqual } from '@memberjunction/testing-integration/registry';
import {
    VotingCastBallotOperation,
    VotingCertifyOperation,
    VotingCloseElectionOperation,
    VotingCreateElectionOperation,
    VotingFreezeRollOperation,
    VotingGetMyBallotOperation,
    VotingGetMyParticipationOperation,
    VotingGetResultsOperation,
    VotingGetTurnoutOperation,
    VotingIssueSecondFactorPinsOperation,
    VotingOpenElectionOperation,
    VotingTallyOperation,
    VotingVerifyReceiptOperation,
    type VotingBallotStyle,
    type VotingBallotSubmission,
    type VotingCastBallotOutput,
    type VotingCertifyOutput,
    type VotingGetMyBallotOutput,
    type VotingGetMyParticipationOutput,
    type VotingGetTurnoutOutput,
    type VotingVerifyReceiptOutput,
    type VotingContestOutcome,
    type VotingContestSpec,
    type VotingCreateElectionInput,
    type VotingGetResultsOutput,
    type VotingTallyOutput,
    type mjBizAppsVotingBallotDistributionEntity,
} from '@mj-biz-apps/voting-entities';
import { RequestGuestSession, type EdgeRefusal, type GuestSession } from './guest-session.js';
import type { PersonaKey } from './persona-model.js';
import { WireCast } from './wire-cast.js';
import { WireClient } from './wire-client.js';

const CONTESTS = 'MJ_BizApps_Voting: Contests';
const OPTIONS = 'MJ_BizApps_Voting: Contest Options';
const DISTRIBUTIONS = 'MJ_BizApps_Voting: Ballot Distributions';
const ELIGIBLE_VOTERS = 'MJ_BizApps_Voting: Eligible Voters';
const ELECTIONS = 'MJ_BizApps_Voting: Elections';

/** One id per process: names carry it so a rerun never collides with an earlier run's leftovers. */
export const WIRE_RUN_ID = randomBytes(3).toString('hex');

/** `Name [run]`: a unique, greppable election name. */
export function Tagged(name: string): string {
    return `${name} [${WIRE_RUN_ID}]`;
}

// --------------------------------------------------------------------------------------------------------------------
// Result plumbing and assertions
// --------------------------------------------------------------------------------------------------------------------

/** Throws unless the call went through AND the operation reported success; returns the typed output. */
export function Ok<TOutput extends { Success: boolean; Message?: string }>(what: string, result: RemoteOpResult<TOutput>): TOutput {
    if (!result.Success || !result.Output) throw new Error(`${what} failed over the wire: ${result.ResultCode ?? '?'}: ${result.ErrorMessage ?? 'no output'}`);
    if (!result.Output.Success) throw new Error(`${what} refused: ${result.Output.Message ?? 'no message'}`);
    return result.Output;
}

/** Asserts the remote layer refused the caller (authorization), naming the operation. */
export function AssertForbidden(result: RemoteOpResult<unknown>, operationKey: string, who: string): void {
    Assert(!result.Success, `${who} must be refused ${operationKey}`);
    AssertEqual(result.ResultCode, 'FORBIDDEN', `${who}: refusal code for ${operationKey}`);
    Assert((result.ErrorMessage ?? '').includes(`'${operationKey}'`), `${who}: the refusal names ${operationKey} (got: ${result.ErrorMessage})`);
}

/**
 * Asserts the operation ran and DECLINED for a stated reason: the transport call succeeded, the output says
 * `Success: false`, and the message contains `reason` (case-insensitive).
 */
export function AssertDeclined(result: RemoteOpResult<{ Success: boolean; Message?: string }>, reason: string, what: string): void {
    Assert(result.Success, `${what}: the call itself should reach the operation (got ${result.ResultCode}: ${result.ErrorMessage})`);
    Assert(result.Output?.Success === false, `${what}: the operation must decline, but it reported success`);
    const message = result.Output?.Message ?? '';
    if (process.env.WIRE_TRACE) console.log(`      [trace] ${what}: "${message}"`);
    Assert(message.toLowerCase().includes(reason.toLowerCase()), `${what}: expected the reason to mention "${reason}", got: "${message}"`);
}

/** Either refusal style (authorization or operation decline) is acceptable; the reason text is still checked when it is a decline. */
export function AssertNotAllowed(result: RemoteOpResult<{ Success: boolean; Message?: string }>, what: string): void {
    const refused = !result.Success || result.Output?.Success === false;
    Assert(refused, `${what}: should have been refused`);
}

// --------------------------------------------------------------------------------------------------------------------
// Election building
// --------------------------------------------------------------------------------------------------------------------

export interface WireVoterSpec {
    Email: string;
    SourceKey: string;
    Weight?: number;
    VotingClass?: string;
    /** Set when the voter is a provisioned persona (votes with its API key); otherwise a guest session is used. */
    Persona?: PersonaKey;
}

export interface WireElectionSpec {
    TypeCode: string;
    Name: string;
    Voters: WireVoterSpec[];
    Contests: VotingContestSpec[];
    /** Any other CreateElection field (SecrecyMode, AssuranceTier, ResultsTiming, ResultsAudience, Configuration, ...). */
    Extra?: Partial<VotingCreateElectionInput>;
}

export interface ContestHandle {
    ContestID: string;
    Name: string;
    Kind: string;
    /** Option label -> option id. */
    OptionIDByLabel: Map<string, string>;
    /** Option id -> label. */
    LabelByOptionID: Map<string, string>;
}

export interface VoterHandle extends WireVoterSpec {
    EligibleVoterID?: string;
    Pin?: string;
}

/** A persona as a voter. `index` keeps SourceKeys unique inside one roll. */
export function PersonaVoter(cast: WireCast, key: PersonaKey, index: number, extra: Partial<WireVoterSpec> = {}): WireVoterSpec {
    return { Email: cast.Record(key).Email, SourceKey: `p${index}-${key}`, Persona: key, ...extra };
}

/** A world person (`wNN@voting-world.test`, see ../world) as a guest voter. The world must be loaded first. */
export function WorldGuest(n: number, extra: Partial<WireVoterSpec> = {}): WireVoterSpec {
    const key = String(n).padStart(2, '0');
    return { Email: `w${key}@voting-world.test`, SourceKey: `wl-w${key}`, ...extra };
}

/** A Yes/No motion decided by a simple majority of the votes cast; abstention allowed. */
export function MotionSpec(name: string, extra: Partial<VotingContestSpec> = {}): VotingContestSpec {
    return { Name: name, Kind: 'Motion', TallyMethodCode: 'majority', Threshold: 'Majority', ThresholdBasis: 'VotesCast', AllowAbstain: true, Options: [{ Label: 'Yes' }, { Label: 'No' }], ...extra };
}

/** Roll rows -> the CSV source settings. */
function CsvRows(voters: WireVoterSpec[]): Array<Record<string, string | number>> {
    return voters.map((v) => {
        const row: Record<string, string | number> = { Email: v.Email, SourceKey: v.SourceKey, Weight: v.Weight ?? 1 };
        if (v.VotingClass) row.VotingClass = v.VotingClass;
        return row;
    });
}

export class LiveElection {
    public readonly Voters: VoterHandle[];
    private readonly sessions = new Map<string, WireVoter>();

    public constructor(
        public readonly Cast: WireCast,
        public readonly Admin: WireClient,
        public readonly ElectionID: string,
        public readonly Name: string,
        public readonly Slug: string,
        public readonly Contests: ContestHandle[],
        voters: WireVoterSpec[]
    ) {
        this.Voters = voters.map((v) => ({ ...v }));
    }

    /** Re-reads contests and options (after nominations added candidates). */
    public async RefreshContests(): Promise<void> {
        const fresh = await ReadContests(this.Admin, this.ElectionID);
        this.Contests.splice(0, this.Contests.length, ...fresh);
    }

    public Contest(name: string): ContestHandle {
        const c = this.Contests.find((x) => x.Name === name);
        if (!c) throw new Error(`no contest "${name}" in election "${this.Name}"`);
        return c;
    }

    public Voter(email: string): VoterHandle {
        const v = this.Voters.find((x) => x.Email.toLowerCase() === email.toLowerCase());
        if (!v) throw new Error(`${email} is not on the roll of "${this.Name}"`);
        return v;
    }

    /** The voter's session (a persona's API-key client, or a guest session from POST /vote/session). Cached. */
    public async Session(email: string): Promise<WireVoter> {
        const existing = this.sessions.get(email.toLowerCase());
        if (existing) return existing;
        const voter = this.Voter(email);
        const session = voter.Persona ? await WireVoter.ForPersona(this, voter) : await WireVoter.ForGuest(this, voter);
        this.sessions.set(email.toLowerCase(), session);
        return session;
    }

    // ---- admin steps -------------------------------------------------------------------------------------------

    public async Freeze(): Promise<{ VoterCount: number; RollHash: string }> {
        const out = Ok('Voting.FreezeRoll', await this.Admin.Call(new VotingFreezeRollOperation(), { ElectionID: this.ElectionID }));
        return { VoterCount: out.VoterCount ?? -1, RollHash: out.RollHash ?? '' };
    }

    public async Distribute(): Promise<void> {
        const distribution = await this.Admin.NewEntity<mjBizAppsVotingBallotDistributionEntity>(DISTRIBUTIONS);
        distribution.NewRecord();
        distribution.ElectionID = this.ElectionID;
        distribution.Name = `${this.Name} ballot`;
        distribution.Slug = this.Slug;
        distribution.DistributionKey = `key_${randomBytes(8).toString('hex')}`;
        distribution.Status = 'Active';
        distribution.AllowedCredentialMethods = JSON.stringify(['second-factor']);
        if (!(await distribution.Save())) throw new Error(`Ballot Distribution save over the wire failed: ${distribution.LatestResult?.CompleteMessage ?? 'unknown'}`);
    }

    public async Open(): Promise<void> {
        Ok('Voting.OpenElection', await this.Admin.Call(new VotingOpenElectionOperation(), { ElectionID: this.ElectionID }));
    }

    public async Close(): Promise<void> {
        Ok('Voting.CloseElection', await this.Admin.Call(new VotingCloseElectionOperation(), { ElectionID: this.ElectionID }));
    }

    /** Issues PINs and records, per voter, the roll entry id and the PIN. */
    public async IssuePins(): Promise<void> {
        const issued = Ok('Voting.IssueSecondFactorPins', await this.Admin.Call(new VotingIssueSecondFactorPinsOperation(), { ElectionID: this.ElectionID }));
        const roll = await this.Admin.RunView<{ ID: string; PersonID: string; SourceKey: string | null }>({
            EntityName: ELIGIBLE_VOTERS,
            ExtraFilter: `ElectionID = '${this.ElectionID}'`,
            Fields: ['ID', 'PersonID', 'SourceKey'],
            ResultType: 'simple',
            BypassCache: true,
        });
        if (!roll.Success) throw new Error(`could not read the roll over the wire: ${roll.ErrorMessage}`);
        for (const voter of this.Voters) {
            const entry = roll.Results.find((r) => r.SourceKey === voter.SourceKey);
            const pin = issued.Issued?.find((p) => p.EligibleVoterID.toLowerCase() === entry?.ID.toLowerCase());
            if (!entry || !pin) throw new Error(`voter ${voter.Email} is not on the roll or received no PIN`);
            voter.EligibleVoterID = entry.ID;
            voter.Pin = pin.Pin;
        }
    }

    /** Freeze -> distribution -> open -> PINs: the admin's "go live" sequence. */
    public async GoLive(): Promise<void> {
        if (!(await ReadElectionRow(this.Admin, this.ElectionID))?.RollFrozenAt) await this.Freeze();
        await this.Distribute();
        await this.Open();
        await this.IssuePins();
    }

    public async Turnout(client: WireClient = this.Admin): Promise<RemoteOpResult<VotingGetTurnoutOutput>> {
        return client.Call(new VotingGetTurnoutOperation(), { ElectionID: this.ElectionID });
    }

    public async TallyAs(client: WireClient, seed?: string): Promise<RemoteOpResult<VotingTallyOutput>> {
        return client.Call(new VotingTallyOperation(), { ElectionID: this.ElectionID, TieBreakSeed: seed });
    }

    /** Close, then tally as the admin; returns the labelled per-contest results. */
    public async CloseAndTally(seed?: string): Promise<LabelledContest[]> {
        await this.Close();
        const out = Ok('Voting.Tally', await this.TallyAs(this.Admin, seed));
        return (out.Contests ?? []).map((c) => this.Label(c));
    }

    public async CertifyAs(client: WireClient, notes?: string): Promise<RemoteOpResult<VotingCertifyOutput>> {
        return client.Call(new VotingCertifyOperation(), { ElectionID: this.ElectionID, Notes: notes });
    }

    public async ResultsFor(client: WireClient): Promise<RemoteOpResult<VotingGetResultsOutput>> {
        return client.Call(new VotingGetResultsOperation(), { ElectionID: this.ElectionID });
    }

    /** The labelled outcome of a result contest. */
    public Label(outcome: VotingContestOutcome): LabelledContest {
        const contest = this.Contests.find((c) => c.ContestID.toLowerCase() === outcome.ContestID.toLowerCase());
        if (!contest) throw new Error(`result contest ${outcome.ContestID} is not a contest of "${this.Name}"`);
        return LabelOutcome(contest, outcome);
    }

    public LabelAll(outcomes: VotingContestOutcome[] | undefined): Map<string, LabelledContest> {
        return new Map((outcomes ?? []).map((o) => {
            const l = this.Label(o);
            return [l.Name, l] as const;
        }));
    }

    /** Best-effort tidy-up so an abandoned run does not leave an open public ballot. Never throws. */
    public async Cleanup(): Promise<void> {
        try {
            await this.Admin.Call(new VotingCloseElectionOperation(), { ElectionID: this.ElectionID });
        } catch {
            // teardown must not mask a check's own failure
        }
    }
}

/** Creates a Draft election as the admin and reads its contests/options back (ids by label). */
export async function CreateDraftElection(cast: WireCast, admin: WireClient, spec: WireElectionSpec): Promise<LiveElection> {
    const slug = `wire-${WIRE_RUN_ID}-${randomBytes(3).toString('hex')}`;
    const created = Ok(
        'Voting.CreateElection',
        await admin.Call(new VotingCreateElectionOperation(), {
            ElectionTypeCode: spec.TypeCode,
            Name: spec.Name,
            EligibilitySource: { Code: 'csv', Settings: { Rows: CsvRows(spec.Voters) } },
            Contests: spec.Contests,
            ...spec.Extra,
        })
    );
    const electionID = created.ElectionID as string;
    const contests = await ReadContests(admin, electionID);
    return new LiveElection(cast, admin, electionID, spec.Name, slug, contests, spec.Voters);
}

/** Draft -> open, with PINs issued. The common case for a fixture. */
export async function CreateLiveElection(cast: WireCast, admin: WireClient, spec: WireElectionSpec): Promise<LiveElection> {
    const election = await CreateDraftElection(cast, admin, spec);
    await election.GoLive();
    return election;
}

/** Reads an election's contests and options over the wire (as `client`). */
export async function ReadContests(client: WireClient, electionID: string): Promise<ContestHandle[]> {
    const contests = await client.RunView<{ ID: string; Name: string; Kind: string }>({
        EntityName: CONTESTS,
        ExtraFilter: `ElectionID = '${electionID}'`,
        Fields: ['ID', 'Name', 'Kind'],
        OrderBy: 'Sequence',
        ResultType: 'simple',
            BypassCache: true,
    });
    if (!contests.Success) throw new Error(`could not read contests over the wire: ${contests.ErrorMessage}`);
    const handles: ContestHandle[] = [];
    for (const c of contests.Results) {
        const options = await client.RunView<{ ID: string; Label: string }>({
            EntityName: OPTIONS,
            ExtraFilter: `ContestID = '${c.ID}'`,
            Fields: ['ID', 'Label'],
            OrderBy: 'Sequence',
            ResultType: 'simple',
            BypassCache: true,
        });
        if (!options.Success) throw new Error(`could not read options over the wire: ${options.ErrorMessage}`);
        handles.push({
            ContestID: c.ID,
            Name: c.Name,
            Kind: c.Kind,
            OptionIDByLabel: new Map(options.Results.map((o) => [o.Label, o.ID])),
            LabelByOptionID: new Map(options.Results.map((o) => [o.ID.toLowerCase(), o.Label])),
        });
    }
    return handles;
}

/** Reads a stored election row's few headline columns over the wire. */
export async function ReadElectionRow(client: WireClient, electionID: string): Promise<{ Status: string; RollFrozenAt: string | null; RollHash: string | null; SecrecyMode: string; AssuranceTier: string; ResultsTiming: string; ResultsAudience: string } | undefined> {
    const res = await client.RunView<{ Status: string; RollFrozenAt: string | null; RollHash: string | null; SecrecyMode: string; AssuranceTier: string; ResultsTiming: string; ResultsAudience: string }>({
        EntityName: ELECTIONS,
        ExtraFilter: `ID = '${electionID}'`,
        Fields: ['Status', 'RollFrozenAt', 'RollHash', 'SecrecyMode', 'AssuranceTier', 'ResultsTiming', 'ResultsAudience'],
        ResultType: 'simple',
            BypassCache: true,
    });
    if (!res.Success) throw new Error(`could not read the election over the wire: ${res.ErrorMessage}`);
    return res.Results[0];
}

// --------------------------------------------------------------------------------------------------------------------
// Voters and ballots
// --------------------------------------------------------------------------------------------------------------------

/** A voter's choice in one contest: abstain, or option labels (for ranked contests the ARRAY ORDER is the ranking, first = rank 1). */
export type ContestPick = 'abstain' | string[];

/** A whole ballot: contest name -> pick. */
export type BallotPlan = Record<string, ContestPick>;

export interface CastAttempt {
    Result: RemoteOpResult<VotingCastBallotOutput>;
    /** True when the cast was accepted. */
    Accepted: boolean;
    Receipt?: string;
    Message?: string;
}

/** Waits out the edge's per-IP window (20 sessions/min per slug by default) instead of failing the check. */
export async function PatientGuestSession(slug: string, credential: { SourceKey: string; Pin: string }, maxWaitMs = 150_000): Promise<GuestSession | EdgeRefusal> {
    const started = Date.now();
    for (;;) {
        const result = await RequestGuestSession(slug, credential);
        if (result.Kind === 'session' || result.Code !== 'rate_limited' || Date.now() - started > maxWaitMs) return result;
        await new Promise((r) => setTimeout(r, 4000));
    }
}

export class WireVoter {
    private constructor(
        public readonly Election: LiveElection,
        public readonly Handle: VoterHandle,
        public readonly Client: WireClient,
        public readonly Kind: 'persona' | 'guest'
    ) {}

    public static async ForPersona(election: LiveElection, voter: VoterHandle): Promise<WireVoter> {
        if (!voter.Persona) throw new Error(`${voter.Email} is not a persona`);
        return new WireVoter(election, voter, await election.Cast.As(voter.Persona), 'persona');
    }

    public static async ForGuest(election: LiveElection, voter: VoterHandle): Promise<WireVoter> {
        if (!voter.Pin) throw new Error(`${voter.Email} has no PIN: issue PINs first`);
        const session = await PatientGuestSession(election.Slug, { SourceKey: voter.SourceKey, Pin: voter.Pin });
        if (session.Kind === 'refused') throw new Error(`guest sign-in refused for ${voter.Email}: ${session.Status} ${session.Code}: ${session.ErrorMessage}`);
        return new WireVoter(election, voter, await WireClient.ConnectGuest(`guest-${voter.SourceKey}`, session.Token), 'guest');
    }

    public async GetBallot(): Promise<RemoteOpResult<VotingGetMyBallotOutput>> {
        return this.Client.Call(new VotingGetMyBallotOperation(), { ElectionID: this.Election.ElectionID });
    }

    public async Participation(): Promise<RemoteOpResult<VotingGetMyParticipationOutput>> {
        return this.Client.Call(new VotingGetMyParticipationOperation(), { ElectionID: this.Election.ElectionID });
    }

    public async VerifyReceipt(receipt: string, electionID = this.Election.ElectionID): Promise<RemoteOpResult<VotingVerifyReceiptOutput>> {
        return this.Client.Call(new VotingVerifyReceiptOperation(), { ElectionID: electionID, ReceiptCode: receipt });
    }

    public async Results(): Promise<RemoteOpResult<VotingGetResultsOutput>> {
        return this.Election.ResultsFor(this.Client);
    }

    /** Fetches the ballot style fresh, builds the submission from the plan, casts it. */
    public async CastPlan(plan: BallotPlan, overrides: { BallotStyleHash?: string; Submission?: VotingBallotSubmission } = {}): Promise<CastAttempt> {
        const ballot = Ok('Voting.GetMyBallot', await this.GetBallot());
        const style = ballot.Style;
        if (!style) throw new Error('GetMyBallot returned no style');
        const submission = overrides.Submission ?? BuildSubmission(this.Election, style, plan);
        const result = await this.Client.Call(new VotingCastBallotOperation(), {
            ElectionID: this.Election.ElectionID,
            BallotStyleHash: overrides.BallotStyleHash ?? style.Hash,
            Submission: submission,
        });
        const accepted = result.Success && result.Output?.Success === true;
        return { Result: result, Accepted: accepted, Receipt: result.Output?.ReceiptCode, Message: result.Output?.Message ?? result.ErrorMessage };
    }

    /** Casts and throws unless accepted; returns the receipt. */
    public async MustCast(plan: BallotPlan): Promise<string> {
        const attempt = await this.CastPlan(plan);
        if (!attempt.Accepted || !attempt.Receipt) throw new Error(`cast by ${this.Handle.Email} was not accepted: ${attempt.Message ?? attempt.Result.ResultCode}`);
        return attempt.Receipt;
    }
}

/** Builds a submission from the server's own ballot style, matching contests by name and options by label. */
export function BuildSubmission(election: LiveElection, style: VotingBallotStyle, plan: BallotPlan): VotingBallotSubmission {
    return {
        Contests: style.Contests.map((sc) => {
            const pick = plan[sc.Name];
            if (pick === undefined) throw new Error(`the plan has no pick for contest "${sc.Name}"`);
            if (pick === 'abstain') return { ContestID: sc.ContestID, Abstain: true, Selections: [] };
            const handle = election.Contest(sc.Name);
            return {
                ContestID: sc.ContestID,
                Selections: pick.map((label, i) => {
                    const optionID = handle.OptionIDByLabel.get(label);
                    if (!optionID) throw new Error(`contest "${sc.Name}" has no option labelled "${label}"`);
                    return sc.IsRanked ? { OptionID: optionID, Rank: i + 1 } : { OptionID: optionID };
                }),
            };
        }),
    };
}

/** Casts every plan with the voters in roll order; returns the receipts. A rejected cast fails the fixture loudly. */
export async function CastAll(election: LiveElection, plans: BallotPlan[], voterEmails?: string[]): Promise<string[]> {
    const emails = voterEmails ?? election.Voters.map((v) => v.Email);
    if (plans.length > emails.length) throw new Error(`${plans.length} ballots planned but only ${emails.length} voters on the roll`);
    const receipts: string[] = [];
    for (let i = 0; i < plans.length; i++) {
        const voter = await election.Session(emails[i]);
        receipts.push(await voter.MustCast(plans[i]));
    }
    return receipts;
}

/** `n` copies of a plan. */
export function Times(n: number, plan: BallotPlan): BallotPlan[] {
    return Array.from({ length: n }, () => ({ ...plan }));
}

// --------------------------------------------------------------------------------------------------------------------
// Labelled results
// --------------------------------------------------------------------------------------------------------------------

export interface LabelledOption {
    Votes: number;
    Position: number;
    Outcome: string;
}

export interface LabelledRound {
    Round: number;
    Tallies: Record<string, number>;
    Elected: string[];
    Excluded: string[];
    Transfers?: Record<string, number>;
    Exhausted?: number;
}

export interface LabelledContest {
    ContestID: string;
    Name: string;
    Outcome: string;
    VotesCast: number;
    Abstentions: number;
    TieBroken: boolean;
    Notes: string[];
    Options: Record<string, LabelledOption>;
    Rounds: LabelledRound[];
    /** Labels in finishing-position order. */
    Order: string[];
}

function relabelKeys(map: Record<string, number> | undefined, c: ContestHandle): Record<string, number> | undefined {
    if (!map) return undefined;
    return Object.fromEntries(Object.entries(map).map(([id, v]) => [c.LabelByOptionID.get(id.toLowerCase()) ?? id, v]));
}

export function LabelOutcome(contest: ContestHandle, outcome: VotingContestOutcome): LabelledContest {
    const label = (id: string): string => contest.LabelByOptionID.get(id.toLowerCase()) ?? id;
    const options: Record<string, LabelledOption> = {};
    for (const o of outcome.Options) options[label(o.OptionID)] = { Votes: o.Votes, Position: o.Position, Outcome: o.Outcome };
    return {
        ContestID: outcome.ContestID,
        Name: contest.Name,
        Outcome: outcome.Outcome,
        VotesCast: outcome.VotesCast,
        Abstentions: outcome.Abstentions,
        TieBroken: outcome.TieBroken === true,
        Notes: outcome.Notes ?? [],
        Options: options,
        Rounds: (outcome.Rounds ?? []).map((r) => ({
            Round: r.Round,
            Tallies: relabelKeys(r.Tallies, contest) ?? {},
            Elected: r.Elected.map(label),
            Excluded: r.Excluded.map(label),
            Transfers: relabelKeys(r.Transfers, contest),
            Exhausted: r.Exhausted,
        })),
        Order: [...outcome.Options].sort((a, b) => a.Position - b.Position).map((o) => label(o.OptionID)),
    };
}

/** Compares numbers with the 1e-6 rounding the tally applies. */
export function AssertClose(actual: number | undefined, expected: number, message: string): void {
    Assert(actual !== undefined && Math.abs(actual - expected) < 1e-4, `${message}: expected ${expected}, got ${actual}`);
}

/** Asserts a labelled contest's vote totals (omitted labels are not checked). */
export function AssertVotes(contest: LabelledContest, expected: Record<string, number>): void {
    for (const [label, votes] of Object.entries(expected)) {
        const o = contest.Options[label];
        Assert(!!o, `contest "${contest.Name}" has no option "${label}" in its results`);
        AssertClose(o.Votes, votes, `contest "${contest.Name}": votes for ${label}`);
    }
}

/** Asserts exactly these labels have this option outcome and no others do. */
export function AssertOutcomeSet(contest: LabelledContest, outcome: string, labels: string[]): void {
    const actual = Object.entries(contest.Options).filter(([, o]) => o.Outcome === outcome).map(([l]) => l).sort();
    AssertEqual(JSON.stringify(actual), JSON.stringify([...labels].sort()), `contest "${contest.Name}": options with outcome ${outcome}`);
}

/** Key-order-independent serialization, for comparing result maps. */
export function Canon(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(Canon).join(',')}]`;
    if (value !== null && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
        return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${Canon(v)}`).join(',')}}`;
    }
    return JSON.stringify(value);
}
