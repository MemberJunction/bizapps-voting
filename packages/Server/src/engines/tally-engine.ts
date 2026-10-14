/**
 * TallyEngine: turns the counted ballots of a Closed election into results (design sections 4.4, 4.5, 10).
 *
 * Pipeline:
 *   1. The election must be Closed, or Tallied for a re-tally (the deliberate recount path) while no certification has been
 *      signed. Certified, Cancelled and every other status are refused (`TallyRefusal`). The check is repeated inside the
 *      write transaction under the election's results lock, which certification takes too, so a re-tally can never land
 *      on results someone has started to certify.
 *   2. Tier B needs the trustee-reconstructed key (TrusteeEngine); tier C needs a registered BaseVerifiableTallyProvider.
 *   3. Counted CastBallots are read with the SYSTEM user, SHUFFLED with a CSPRNG, and only then decrypted, so no order in
 *      the database or the logs survives into processing.
 *   4. Per contest, a TallyContestInput is built (ballot weight = the representative weight of its weight class on the
 *      roll; eligible weight from the roll rows the contest applies to) and the contracts tally method runs with a seed
 *      (given, or 32 random hex characters) that is recorded on the result.
 *   5. In ONE transaction under the tally guard: BallotSelection rows (shuffled order, first tally of a tier A election
 *      only), ContestResult (previous finals demoted, new final) + ContestOptionResult, Election.Status -> Tallied, then
 *      the election-type driver's OnResultsTallied.
 *   6. The audit row carries counts and codes, never ballot content; key material is wiped from memory.
 */

import { BaseSingleton } from '@memberjunction/global';
import { BallotBoxWriteGuard, ElectionTypeDriverRegistry, TallyWriteGuard } from '@mj-biz-apps/voting-core-entities-server';
import {
    type BallotSubmission,
    type TallyContestInput,
    type TallyOutcome,
    type TallyRound,
    type mjBizAppsVotingBallotSelectionEntity,
    type mjBizAppsVotingContestOptionResultEntity,
    type mjBizAppsVotingContestResultEntity,
    GetTallyMethod,
} from '@mj-biz-apps/voting-entities';
import { DecryptSelections } from '../crypto/selection-crypto.js';
import { ResolveVerifiableTallyProvider } from '../crypto/verifiable-tally-provider.js';
import { ElectionAudit } from '../shared/audit.js';
import { type ElectionGraph, LoadElectionGraph, OptionsOf, TallyCodeOf, VotingClassFilterOf } from '../shared/election-graph.js';
import { SystemContext } from '../shared/system-user.js';
import { type EngineResult, type VotingContext, Fail, IsFailure, Ok, PassFailure, RunViewOf } from '../shared/types.js';
import { SqlLiteral } from '../shared/voter-identity.js';
import { AcquireTransactionLocks, ResultsLockResource } from '../shared/transaction-lock.js';
import { ErrorText, BuildResultsContext, LoadElectionEntity, SaveOrThrow, RunTransactional } from './person-support.js';
import {
    type ContestPlan,
    type ContestResultOutcome,
    type ContestResultRow,
    type DecryptedBallot,
    type OptionResultRow,
    type RollWeightRow,
    BuildContestInput,
    BuildContestResultRow,
    ComputeClassWeights,
    ContestNotesOf,
    CryptoShuffle,
    EligibleCountForContest,
    EligibleWeightForContest,
    EvaluateQuorum,
    GenerateTieBreakSeed,
    ParseSubmission,
    SelectionRowsForBallot,
} from './tally-pipeline.js';
import { TrusteeEngine } from './trustee-engine.js';

const CAST_BALLOTS_ENTITY = 'MJ_BizApps_Voting: Cast Ballots';
const ELIGIBLE_VOTERS_ENTITY = 'MJ_BizApps_Voting: Eligible Voters';
const CONTEST_RESULTS_ENTITY = 'MJ_BizApps_Voting: Contest Results';
const CONTEST_OPTION_RESULTS_ENTITY = 'MJ_BizApps_Voting: Contest Option Results';
const BALLOT_SELECTIONS_ENTITY = 'MJ_BizApps_Voting: Ballot Selections';
const CERTIFICATIONS_ENTITY = 'MJ_BizApps_Voting: Election Certifications';

/** Why an election cannot be tallied now, or null when it can. */
export interface TallyRefusalReason {
    Code: 'AlreadyCertified' | 'CertificationInProgress' | 'ElectionCancelled' | 'NotClosed';
    Message: string;
}

/**
 * The tally gate. A Closed election is tallied; a Tallied one may be re-tallied (the recount path) until a certification
 * signature exists, because a certifier signs the results as they stand. Certified results are final.
 * @param status The election's current status.
 * @param certificationStarted Whether a Draft or Certified certification (at least one signature) exists.
 */
export function TallyRefusal(status: string, certificationStarted: boolean): TallyRefusalReason | null {
    if (status === 'Certified') {
        return { Code: 'AlreadyCertified', Message: 'The election is Certified; its results are final and cannot be tallied again.' };
    }
    if (status === 'Cancelled') {
        return { Code: 'ElectionCancelled', Message: 'The election is Cancelled; only a Closed election can be tallied.' };
    }
    if (status !== 'Closed' && status !== 'Tallied') {
        return { Code: 'NotClosed', Message: `The election is ${status}; only a Closed election can be tallied.` };
    }
    if (status === 'Tallied' && certificationStarted) {
        return {
            Code: 'CertificationInProgress',
            Message: 'Certification of these results has started (a certifier has signed); the election cannot be tallied again.',
        };
    }
    return null;
}

/** A refusal discovered inside the write transaction (the state changed after the first check). */
class TallyAbort extends Error {
    constructor(public readonly Reason: TallyRefusalReason) {
        super(Reason.Message);
    }
}

/** One contest's outcome as reported back to the caller (the operation shapes this into its output). */
export interface TallyContestReport {
    ContestID: string;
    /** May be 'NoQuorum', which the operation output enum lacks; the operation maps it. */
    Outcome: ContestResultOutcome;
    VotesCast: number;
    Abstentions: number;
    BallotsCounted: number;
    Options: OptionResultRow[];
    Rounds: TallyRound[];
    TieBroken: boolean;
    Notes: string[];
}

export interface TallyValue {
    Status: string;
    BallotsCounted: number;
    QuorumMet: boolean;
    Contests: TallyContestReport[];
}

interface CastBallotRow {
    ID: string;
    Selections: string;
    VotingClass: string | null;
    WeightClass: string | null;
}

interface TalliedBallot extends DecryptedBallot {
    CastBallotID: string;
}

interface PreparedContest {
    Plan: ContestPlan;
    Input: TallyContestInput;
    Outcome: TallyOutcome;
}

function toRollRow(row: { VotingClass: string | null; Weight: number }): RollWeightRow {
    return { VotingClass: row.VotingClass, Weight: Number(row.Weight) };
}

export class TallyEngine extends BaseSingleton<TallyEngine> {
    protected constructor() {
        super();
    }

    public static get Instance(): TallyEngine {
        return super.getInstance<TallyEngine>();
    }

    /**
     * Tallies a Closed election (or re-tallies a Tallied one).
     * @param tieBreakSeed Optional seed for ties broken by lot; omitted means a fresh random seed, recorded on each result.
     */
    public async Tally(electionID: string, tieBreakSeed: string | undefined, ctx: VotingContext): Promise<EngineResult<TallyValue>> {
        const loaded = await LoadElectionGraph(electionID, ctx);
        if (IsFailure(loaded)) return PassFailure(loaded);
        const graph = loaded.Value;
        const election = graph.Election;
        const refusal = TallyRefusal(election.Status, election.Status === 'Tallied' && (await this.certificationStarted(election.ID, ctx)));
        if (refusal) return Fail(refusal.Code, refusal.Message);
        const firstTally = election.Status === 'Closed';

        const plansResult = this.buildPlans(graph);
        if (IsFailure(plansResult)) return PassFailure(plansResult);
        const plans = plansResult.Value;

        const driverLookup = ElectionTypeDriverRegistry.Instance.GetDriver(graph.ElectionType);
        if (!driverLookup.driver) return Fail('DriverUnavailable', driverLookup.error ?? 'The election type driver is not available.');
        const driver = driverLookup.driver;

        const tierCheck = this.checkTier(graph);
        if (IsFailure(tierCheck)) return PassFailure(tierCheck);

        const roll = await this.loadRoll(election.ID, ctx);
        if (IsFailure(roll)) return PassFailure(roll);
        const rollRows = roll.Value;
        const seed = tieBreakSeed?.trim() ? tieBreakSeed.trim() : GenerateTieBreakSeed();
        const classWeights = ComputeClassWeights(rollRows);

        const prepared = await this.prepareContests(graph, plans, rollRows, classWeights, seed, tierCheck.Value, ctx);
        if (IsFailure(prepared)) return PassFailure(prepared);
        const { Contests: contests, Ballots: ballots } = prepared.Value;

        const quorum = EvaluateQuorum(graph.Configuration.Quorum, prepared.Value.BallotCount, rollRows.length);
        const rows: ContestResultRow[] = contests.map((c) =>
            BuildContestResultRow(c.Plan, c.Outcome, c.Input, EligibleCountForContest(rollRows, c.Plan.VotingClassFilter), quorum.Met)
        );

        try {
            await RunTransactional(ctx, () =>
                TallyWriteGuard.RunWithTallyAccess(async () => {
                    await this.lockAndRecheck(election.ID, election.Status, ctx);
                    await this.demotePreviousFinals(plans, ctx);
                    if (firstTally && election.AssuranceTier === 'Standard') {
                        await this.writeBallotSelections(graph, ballots, ctx);
                    }
                    for (const row of rows) await this.writeContestResult(row, ctx);
                    if (election.Status === 'Closed') {
                        election.Status = 'Tallied';
                        await SaveOrThrow(election, 'The election status');
                    }
                    await driver.OnResultsTallied(await BuildResultsContext(graph, ctx, rows));
                })
            );
        } catch (e) {
            TrusteeEngine.Instance.ClearKeyMaterial(election.ID);
            if (e instanceof TallyAbort) return Fail(e.Reason.Code, e.Reason.Message);
            return Fail('TallyFailed', `The tally was not saved: ${ErrorText(e)}`);
        }

        TrusteeEngine.Instance.ClearKeyMaterial(election.ID);
        await ElectionAudit.Record(ctx, election.ID, 'Tallied', {
            Contests: rows.length,
            BallotsCounted: prepared.Value.BallotCount,
            Retally: !firstTally,
            QuorumMet: quorum.Met,
            AssuranceTier: election.AssuranceTier,
            TieBreakSeed: seed,
        });

        return Ok({
            Status: election.Status,
            BallotsCounted: prepared.Value.BallotCount,
            QuorumMet: quorum.Met,
            Contests: contests.map((c, i) => ({
                ContestID: c.Plan.ContestID,
                Outcome: rows[i].Outcome,
                VotesCast: rows[i].VotesCast,
                Abstentions: rows[i].Abstentions,
                BallotsCounted: rows[i].BallotsCounted,
                Options: rows[i].Options,
                Rounds: c.Outcome.Rounds,
                TieBroken: c.Outcome.TieBroken,
                Notes: ContestNotesOf(rows[i]),
            })),
        });
    }

    // --- Preparation -----------------------------------------------------------------------------------------

    private buildPlans(graph: ElectionGraph): EngineResult<ContestPlan[]> {
        const plans: ContestPlan[] = [];
        for (const contest of graph.Contests) {
            const code = TallyCodeOf(graph, contest.ID);
            if (!GetTallyMethod(code)) return Fail('UnknownTallyMethod', `Contest "${contest.Name}" uses a tally method (${code || 'none'}) that is not available.`);
            plans.push({
                ContestID: contest.ID,
                Kind: contest.Kind,
                Seats: contest.Seats,
                OptionIDs: OptionsOf(graph, contest.ID)
                    .filter((o) => o.Status === 'Active')
                    .slice()
                    .sort((a, b) => a.Sequence - b.Sequence)
                    .map((o) => o.ID),
                Threshold: contest.Threshold,
                CustomThreshold: contest.CustomThreshold,
                ThresholdBasis: contest.ThresholdBasis,
                VotingClassFilter: VotingClassFilterOf(graph, contest.ID),
                TallyMethodCode: code,
                TieBreakMethod: contest.TieBreakMethod,
            });
        }
        return Ok(plans);
    }

    /** Tier gate. Returns the private key for tier B, '' otherwise. */
    private checkTier(graph: ElectionGraph): EngineResult<string> {
        const election = graph.Election;
        if (election.AssuranceTier === 'HighAssurance') {
            const key = TrusteeEngine.Instance.GetReconstructedKey(election.ID);
            if (!key) {
                const held = TrusteeEngine.Instance.GetShareCount(election.ID);
                return Fail(
                    'KeyNotAvailable',
                    `This High assurance election needs ${election.TrusteeThreshold ?? 'the threshold number of'} trustee key shares on this server; ${held} received. Trustees submit their shares, then tally again.`
                );
            }
            return Ok(key);
        }
        if (election.AssuranceTier === 'Verifiable' && !ResolveVerifiableTallyProvider()) {
            return Fail('TierNotSupported', 'This Verifiable election needs a verifiable tally provider (for example ElectionGuard), and none is registered on this server.');
        }
        return Ok('');
    }

    private async loadRoll(electionID: string, ctx: VotingContext): Promise<EngineResult<RollWeightRow[]>> {
        const res = await RunViewOf(ctx).RunView<{ VotingClass: string | null; Weight: number }>(
            {
                EntityName: ELIGIBLE_VOTERS_ENTITY,
                ExtraFilter: `ElectionID = ${SqlLiteral(electionID)} AND Status = 'Eligible'`,
                Fields: ['VotingClass', 'Weight'],
                ResultType: 'simple',
            },
            ctx.ContextUser
        );
        return res.Success ? Ok(res.Results.map(toRollRow)) : Fail('LoadFailed', 'The voter roll could not be loaded.');
    }

    private async prepareContests(
        graph: ElectionGraph,
        plans: ContestPlan[],
        roll: RollWeightRow[],
        classWeights: Record<string, number>,
        seed: string,
        privateKeyPem: string,
        ctx: VotingContext
    ): Promise<EngineResult<{ Contests: PreparedContest[]; Ballots: TalliedBallot[]; BallotCount: number }>> {
        if (graph.Election.AssuranceTier === 'Verifiable') return this.prepareVerifiable(graph, plans, roll, seed, ctx);

        const decrypted = await this.loadAndDecryptBallots(graph, privateKeyPem, ctx);
        if (IsFailure(decrypted)) return PassFailure(decrypted);
        const ballots = decrypted.Value;
        const contests: PreparedContest[] = [];
        for (const plan of plans) {
            const input = BuildContestInput(plan, ballots, classWeights, EligibleWeightForContest(roll, plan.VotingClassFilter), seed);
            const method = GetTallyMethod(plan.TallyMethodCode);
            if (!method) return Fail('UnknownTallyMethod', 'A tally method is not available.');
            try {
                contests.push({ Plan: plan, Input: input, Outcome: method.Tally(input) });
            } catch (e) {
                return Fail('TallyMethodFailed', `Contest ${plan.ContestID} could not be tallied: ${ErrorText(e)}`);
            }
        }
        return Ok({ Contests: contests, Ballots: ballots, BallotCount: ballots.length });
    }

    private async prepareVerifiable(
        graph: ElectionGraph,
        plans: ContestPlan[],
        roll: RollWeightRow[],
        seed: string,
        ctx: VotingContext
    ): Promise<EngineResult<{ Contests: PreparedContest[]; Ballots: TalliedBallot[]; BallotCount: number }>> {
        const provider = ResolveVerifiableTallyProvider();
        if (!provider) return Fail('TierNotSupported', 'No verifiable tally provider is registered on this server.');
        const emptyInputs = plans.map((plan) => BuildContestInput(plan, [], {}, EligibleWeightForContest(roll, plan.VotingClassFilter), seed));
        let produced;
        try {
            produced = await provider.ProduceTally({ Graph: graph, ContestInputs: emptyInputs }, ctx);
        } catch (e) {
            return Fail('VerifiableTallyFailed', `The verifiable tally provider failed: ${ErrorText(e)}`);
        }
        const contests: PreparedContest[] = [];
        for (const plan of plans) {
            const input = produced.ContestInputs.find((i) => i.ContestID.toLowerCase() === plan.ContestID.toLowerCase());
            const method = GetTallyMethod(plan.TallyMethodCode);
            if (!input || !method) return Fail('VerifiableTallyFailed', 'The provider returned no input for a contest.');
            contests.push({ Plan: plan, Input: input, Outcome: method.Tally(input) });
        }
        return Ok({ Contests: contests, Ballots: [], BallotCount: produced.BallotCount });
    }

    /** Counted ballots, system user, SHUFFLED before any ciphertext is opened. */
    private async loadAndDecryptBallots(graph: ElectionGraph, privateKeyPem: string, ctx: VotingContext): Promise<EngineResult<TalliedBallot[]>> {
        const sys = SystemContext(ctx);
        const res = await RunViewOf(sys).RunView<CastBallotRow>(
            {
                EntityName: CAST_BALLOTS_ENTITY,
                ExtraFilter: `ElectionID = ${SqlLiteral(graph.Election.ID)} AND Status = 'Counted'`,
                Fields: ['ID', 'Selections', 'VotingClass', 'WeightClass'],
                ResultType: 'simple',
            },
            sys.ContextUser
        );
        if (!res.Success) return Fail('LoadFailed', 'The ballot box could not be read.');

        const shuffled = CryptoShuffle(res.Results);
        const ballots: TalliedBallot[] = [];
        let failures = 0;
        for (const row of shuffled) {
            const submission = await this.decryptOne(row, graph, privateKeyPem);
            if (!submission) {
                failures++;
                continue;
            }
            ballots.push({ CastBallotID: row.ID, VotingClass: row.VotingClass, WeightClass: row.WeightClass, Submission: submission });
        }
        if (failures > 0) {
            return Fail('DecryptFailed', `${failures} of ${shuffled.length} counted ballots could not be opened; nothing was written.`);
        }
        return Ok(ballots);
    }

    private async decryptOne(row: CastBallotRow, graph: ElectionGraph, privateKeyPem: string): Promise<BallotSubmission | null> {
        try {
            const json = await DecryptSelections(row.Selections, graph, privateKeyPem || undefined);
            return ParseSubmission(json);
        } catch {
            return null;
        }
    }

    // --- Writing ------------------------------------------------------------------------------------------------------

    /**
     * Inside the write transaction: takes the election's results lock (certification takes it too), then re-reads the
     * election and its certification. A status that moved since the first check (a concurrent tally, a certifier signing,
     * a cancellation) aborts the transaction, so exactly one tally's results end up final and none replaces results under
     * certification.
     */
    private async lockAndRecheck(electionID: string, expectedStatus: string, ctx: VotingContext): Promise<void> {
        await AcquireTransactionLocks(SystemContext(ctx), [ResultsLockResource(electionID)]);
        const fresh = await LoadElectionEntity(electionID, ctx);
        if (!fresh) throw new Error('The election could not be re-read.');
        const reason =
            fresh.Status !== expectedStatus
                ? (TallyRefusal(fresh.Status, false) ?? { Code: 'NotClosed' as const, Message: `The election moved to ${fresh.Status} while it was being tallied; tally again.` })
                : TallyRefusal(fresh.Status, fresh.Status === 'Tallied' && (await this.certificationStarted(electionID, ctx)));
        if (reason) throw new TallyAbort(reason);
    }

    /** Whether a certification with at least one signature (Draft) or a completed one exists for the election. Fresh read. */
    private async certificationStarted(electionID: string, ctx: VotingContext): Promise<boolean> {
        const res = await RunViewOf(ctx).RunView(
            {
                EntityName: CERTIFICATIONS_ENTITY,
                ExtraFilter: `ElectionID = ${SqlLiteral(electionID)} AND Status IN ('Draft', 'Certified')`,
                ResultType: 'count_only',
                BypassCache: true,
            },
            ctx.ContextUser
        );
        if (!res.Success) throw new Error('The certification state could not be read.');
        return res.TotalRowCount > 0;
    }

    private async demotePreviousFinals(plans: ContestPlan[], ctx: VotingContext): Promise<void> {
        if (plans.length === 0) return;
        const res = await RunViewOf(ctx).RunView<mjBizAppsVotingContestResultEntity>(
            {
                EntityName: CONTEST_RESULTS_ENTITY,
                ExtraFilter: `IsFinal = 1 AND ContestID IN (${plans.map((p) => SqlLiteral(p.ContestID)).join(',')})`,
                ResultType: 'entity_object',
            },
            ctx.ContextUser
        );
        if (!res.Success) throw new Error('The previous results could not be read.');
        for (const previous of res.Results) {
            previous.IsFinal = false;
            await SaveOrThrow(previous, 'A previous result');
        }
    }

    /** Plaintext selections are kept only for tier A (design section 5); written in the shuffled order, under both guards, as the system user. */
    private async writeBallotSelections(graph: ElectionGraph, ballots: TalliedBallot[], ctx: VotingContext): Promise<void> {
        const sys = SystemContext(ctx);
        const contestIDs = new Set(graph.Contests.map((c) => c.ID.toLowerCase()));
        await BallotBoxWriteGuard.RunWithBallotBoxAccess(async () => {
            for (const ballot of ballots) {
                for (const sel of SelectionRowsForBallot(ballot.Submission, contestIDs)) {
                    const row = await sys.Provider.GetEntityObject<mjBizAppsVotingBallotSelectionEntity>(BALLOT_SELECTIONS_ENTITY, sys.ContextUser);
                    row.NewRecord();
                    row.CastBallotID = ballot.CastBallotID;
                    row.ContestID = sel.ContestID;
                    row.ContestOptionID = sel.ContestOptionID;
                    row.Rank = sel.Rank;
                    row.WriteInText = sel.WriteInText;
                    row.IsAbstain = sel.IsAbstain;
                    await SaveOrThrow(row, 'A ballot selection');
                }
            }
        });
    }

    private async writeContestResult(row: ContestResultRow, ctx: VotingContext): Promise<void> {
        const result = await ctx.Provider.GetEntityObject<mjBizAppsVotingContestResultEntity>(CONTEST_RESULTS_ENTITY, ctx.ContextUser);
        result.NewRecord();
        result.ContestID = row.ContestID;
        result.Outcome = row.Outcome;
        result.BallotsCounted = row.BallotsCounted;
        result.Abstentions = row.Abstentions;
        result.EligibleCount = row.EligibleCount;
        result.VotesCast = row.VotesCast;
        result.Rounds = row.Rounds;
        result.TieBreakSeed = row.TieBreakSeed;
        result.TieBreakNotes = row.TieBreakNotes;
        result.ComputedAt = new Date();
        result.IsFinal = true;
        await SaveOrThrow(result, 'A contest result');
        for (const option of row.Options) {
            const optionResult = await ctx.Provider.GetEntityObject<mjBizAppsVotingContestOptionResultEntity>(CONTEST_OPTION_RESULTS_ENTITY, ctx.ContextUser);
            optionResult.NewRecord();
            optionResult.ContestResultID = result.ID;
            optionResult.ContestOptionID = option.OptionID;
            optionResult.Votes = option.Votes;
            optionResult.Position = option.Position;
            optionResult.Outcome = option.Outcome;
            await SaveOrThrow(optionResult, 'An option result');
        }
    }
}
