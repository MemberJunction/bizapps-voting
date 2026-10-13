/**
 * CastEngine: the single cast transaction of design section 4.1.
 *
 * One all-or-nothing unit of work, written as the SYSTEM user inside BallotBoxWriteGuard so a ballot row never
 * carries the voter's identity:
 *   Participation (unique per voter -> AlreadyVoted)
 *   + CastBallot (database-generated random id, encrypted selections, receipt, voting/weight class)
 *   + BallotAttribution only when SecrecyMode is not Secret
 *   + ContestRunningTally increments only when ResultsTiming is not AfterClose
 *   + BallotComment rows for StandardsItem comments in Open mode.
 * Revote (AllowRevote and not Secret): the Participation row is kept; the previous ballot (found through its
 * attribution) becomes Superseded and the new ballot + attribution are added in the same transaction.
 *
 * NEVER logs the submission or the selections; error messages never include ballot content.
 * The decision logic (window, status, hash, validation, revote) is in pure exported helpers.
 */

import { randomBytes } from 'node:crypto';
import { LogError } from '@memberjunction/core';
import { BaseSingleton, UUIDsEqual } from '@memberjunction/global';
import { BallotBoxWriteGuard, ElectionTypeDriverRegistry } from '@mj-biz-apps/voting-core-entities-server';
import {
    type BallotStyle,
    type BallotSubmission,
    FormatReceiptCode,
    IsReceiptCode,
    NormalizeReceiptCode,
    type ParticipationChannel,
    type SecrecyMode,
    type ValidationIssue,
    ValidateSubmission,
    WeightClassOf,
    type mjBizAppsVotingBallotAttributionEntity,
    type mjBizAppsVotingBallotCommentEntity,
    type mjBizAppsVotingCastBallotEntity,
    type mjBizAppsVotingContestRunningTallyEntity,
    type mjBizAppsVotingEligibleVoterEntity,
    type mjBizAppsVotingParticipationEntity,
} from '@mj-biz-apps/voting-entities';
import { DecryptSelections, EncryptSelections, SelectionCryptoError } from '../crypto/selection-crypto.js';
import { type ElectionGraph, LoadElectionGraph } from '../shared/election-graph.js';
import { SystemContext } from '../shared/system-user.js';
import { BeginTransaction, type EngineResult, Fail, IsFailure, Ok, PassFailure, RunViewOf, type VotingContext } from '../shared/types.js';
import { SqlLiteral } from '../shared/voter-identity.js';
import { BallotStyleBuilder, DEFAULT_BALLOT_LANGUAGE, IsRankedMethod } from './ballot-style-builder.js';

const PARTICIPATIONS = 'MJ_BizApps_Voting: Participations';
const CAST_BALLOTS = 'MJ_BizApps_Voting: Cast Ballots';
const ATTRIBUTIONS = 'MJ_BizApps_Voting: Ballot Attributions';
const RUNNING_TALLIES = 'MJ_BizApps_Voting: Contest Running Tallies';
const COMMENTS = 'MJ_BizApps_Voting: Ballot Comments';
const ELIGIBLE_VOTERS = 'MJ_BizApps_Voting: Eligible Voters';

// === Pure decision helpers ===

export interface RuleFailure {
    Code: string;
    Message: string;
}

/** The election must be Open and `now` inside [OpensAt, ClosesAt); a null bound is unbounded. */
export function CheckElectionWindow(status: string, opensAt: Date | null, closesAt: Date | null, now: Date): RuleFailure | null {
    if (status !== 'Open') return { Code: 'ElectionNotOpen', Message: 'This election is not open for voting.' };
    if (opensAt && now.getTime() < opensAt.getTime()) return { Code: 'NotYetOpen', Message: 'Voting has not opened yet.' };
    if (closesAt && now.getTime() >= closesAt.getTime()) return { Code: 'VotingClosed', Message: 'Voting has closed.' };
    return null;
}

/** The hash the voter submitted must equal the style the server rebuilt for that voter. */
export function CheckStyleHash(submitted: string, rebuilt: string): RuleFailure | null {
    return submitted === rebuilt
        ? null
        : { Code: 'BallotStyleChanged', Message: 'The ballot changed since it was loaded. Reload the ballot and try again.' };
}

/** Collapses validation issues into one failure naming codes (and contests) only. Null when there are none. */
export function SummarizeIssues(issues: ValidationIssue[]): RuleFailure | null {
    if (issues.length === 0) return null;
    const parts = issues.slice(0, 10).map((i) => (i.ContestID ? `${i.Code} (contest ${i.ContestID})` : i.Code));
    return { Code: 'InvalidSubmission', Message: `The ballot is not valid: ${parts.join('; ')}.` };
}

export type CastDecision = { Kind: 'First' } | { Kind: 'Revote' } | { Kind: 'AlreadyVoted' };

/** First vote, an allowed revote, or a refusal. A Secret election never allows a revote. */
export function DecideCastKind(p: { HasParticipation: boolean; AllowRevote: boolean; SecrecyMode: SecrecyMode }): CastDecision {
    if (!p.HasParticipation) return { Kind: 'First' };
    return p.AllowRevote && p.SecrecyMode !== 'Secret' ? { Kind: 'Revote' } : { Kind: 'AlreadyVoted' };
}

/** Whether a BallotAttribution row is written. */
export function NeedsAttribution(secrecy: SecrecyMode): boolean {
    return secrecy !== 'Secret';
}

/** Whether running tallies are maintained at cast time (tier A only: higher tiers cannot be read before the ceremony). */
export function MaintainsRunningTally(resultsTiming: string, assuranceTier: string): boolean {
    return resultsTiming !== 'AfterClose' && assuranceTier === 'Standard';
}

export interface TallyDelta {
    ContestID: string;
    OptionID: string | null;
    Delta: number;
}

/** Running-tally increments for one ballot. Abstentions count under a null option. Ranked contests: first preferences only. */
export function PlanTallyDeltas(style: BallotStyle, submission: BallotSubmission, weight: number, sign: 1 | -1): TallyDelta[] {
    const deltas: TallyDelta[] = [];
    const amount = weight * sign;
    for (const contest of style.Contests) {
        const sub = submission.Contests.find((c) => c.ContestID === contest.ContestID);
        if (!sub) continue;
        if (sub.Abstain) {
            deltas.push({ ContestID: contest.ContestID, OptionID: null, Delta: amount });
            continue;
        }
        for (const sel of sub.Selections) {
            if (contest.IsRanked && sel.Rank !== undefined && sel.Rank !== 1) continue;
            deltas.push({ ContestID: contest.ContestID, OptionID: sel.OptionID, Delta: amount });
        }
    }
    return deltas;
}

/** Sums deltas that touch the same contest/option; drops zero results. */
export function MergeTallyDeltas(...lists: TallyDelta[][]): TallyDelta[] {
    const merged = new Map<string, TallyDelta>();
    for (const d of lists.flat()) {
        const key = `${d.ContestID.toLowerCase()}|${(d.OptionID ?? '').toLowerCase()}`;
        const hit = merged.get(key);
        if (hit) hit.Delta += d.Delta;
        else merged.set(key, { ...d });
    }
    return [...merged.values()].filter((d) => d.Delta !== 0);
}

/** A 20-character Crockford receipt from 16 crypto-random bytes, grouped 4-4-4-4-4. */
export function GenerateReceiptCode(): string {
    return FormatReceiptCode(randomBytes(16));
}

/** Whether a failed Participation save was the per-voter uniqueness constraint. */
export function IsUniqueViolation(message: string | undefined | null): boolean {
    return !!message && /UQ_|unique|duplicate/i.test(message);
}

// === Engine ===

export interface CastParams {
    ElectionID: string;
    EligibleVoterID: string;
    BallotStyleHash: string;
    Submission: BallotSubmission;
    Channel: ParticipationChannel;
    CredentialMethodID?: string;
    EnteredByUserID?: string;
    ProxyDesignationID?: string;
    /** Ballot language the voter was shown (part of the style hash). Defaults to 'en'. */
    Language?: string;
}

export interface MyParticipation {
    HasVoted: boolean;
    Channel?: ParticipationChannel;
    CastAt?: Date;
    CanRevote: boolean;
    /** Only when the election links ballots to voters (not Secret). */
    ReceiptCode?: string;
}

/** Aborts the transaction with a stable code. */
class CastAbort extends Error {
    constructor(public readonly Code: string, message: string) {
        super(message);
    }
}

export class CastEngine extends BaseSingleton<CastEngine> {
    protected constructor() {
        super();
    }

    public static get Instance(): CastEngine {
        return super.getInstance<CastEngine>();
    }

    public async Cast(p: CastParams, ctx: VotingContext): Promise<EngineResult<{ ReceiptCode: string }>> {
        try {
            const graphRes = await LoadElectionGraph(p.ElectionID, ctx);
            if (IsFailure(graphRes)) return PassFailure(graphRes);
            const graph = graphRes.Value;
            const election = graph.Election;

            const window = CheckElectionWindow(election.Status, election.OpensAt, election.ClosesAt, new Date());
            if (window) return Fail(window.Code, window.Message);

            const sys = SystemContext(ctx);
            const voter = await this.loadVoter(p.EligibleVoterID, sys);
            if (!voter || !UUIDsEqual(voter.ElectionID, election.ID) || voter.Status !== 'Eligible') {
                return Fail('NotEligible', 'You are not eligible to vote in this election.');
            }

            const style = await BallotStyleBuilder.Instance.Build(graph, voter.VotingClass, p.Language ?? DEFAULT_BALLOT_LANGUAGE, ctx);
            const hashFailure = CheckStyleHash(p.BallotStyleHash, style.Hash);
            if (hashFailure) return Fail(hashFailure.Code, hashFailure.Message);
            const invalid = SummarizeIssues(ValidateSubmission(style, p.Submission));
            if (invalid) return Fail(invalid.Code, invalid.Message);

            const weightClass = WeightClassOf(voter.Weight);
            const { driver, error } = ElectionTypeDriverRegistry.Instance.GetDriver(graph.ElectionType);
            if (!driver) return Fail('DriverUnavailable', error ?? 'The election type driver is not available.');
            const driverMessage = await driver.ValidateCast({
                ContextUser: ctx.ContextUser,
                Provider: ctx.Provider,
                Election: election,
                ElectionType: graph.ElectionType,
                Configuration: graph.Configuration,
                Submission: p.Submission,
                VotingClass: voter.VotingClass,
                WeightClass: weightClass,
            });
            if (driverMessage) return Fail('CastRejected', driverMessage);

            const existing = await this.findParticipation(election.ID, voter.ID, sys);
            const decision = DecideCastKind({ HasParticipation: !!existing, AllowRevote: election.AllowRevote, SecrecyMode: election.SecrecyMode });
            if (decision.Kind === 'AlreadyVoted') return Fail('AlreadyVoted', 'You have already voted in this election.');

            const selections = await EncryptSelections(JSON.stringify(p.Submission), graph);
            return await this.writeBallot({ p, graph, style, voter, weightClass, selections, existingParticipationID: existing?.ID ?? null, ctx });
        } catch (e) {
            if (e instanceof SelectionCryptoError) return Fail(e.Code, 'Ballots cannot be recorded for this election right now.');
            // Deliberately only the error name: a driver or database message could echo ballot content.
            LogError(`CastEngine: cast failed (${e instanceof Error ? e.name : 'unknown'}).`);
            return Fail('CastFailed', 'Your ballot could not be recorded. Please try again.');
        }
    }

    /** The voter's own poll-book state. */
    public async GetMyParticipation(electionID: string, eligibleVoterID: string, ctx: VotingContext): Promise<EngineResult<MyParticipation>> {
        const graphRes = await LoadElectionGraph(electionID, ctx);
        if (IsFailure(graphRes)) return PassFailure(graphRes);
        const election = graphRes.Value.Election;
        const sys = SystemContext(ctx);
        const part = await this.findParticipation(election.ID, eligibleVoterID, sys);
        const canRevote = election.AllowRevote && election.SecrecyMode !== 'Secret' && election.Status === 'Open';
        if (!part) return Ok({ HasVoted: false, CanRevote: false });
        const result: MyParticipation = { HasVoted: true, Channel: part.Channel, CastAt: part.CastAt, CanRevote: canRevote };
        if (NeedsAttribution(election.SecrecyMode)) {
            const ballot = await this.findCurrentBallot(part.ID, sys);
            if (ballot) result.ReceiptCode = ballot.ReceiptCode;
        }
        return Ok(result);
    }

    /** Whether a receipt exists in the election's ballot box, and whether it counts. Reveals nothing else. */
    public async VerifyReceipt(electionID: string, receipt: string, ctx: VotingContext): Promise<EngineResult<{ Found: boolean; Counted: boolean }>> {
        const normalized = NormalizeReceiptCode(receipt ?? '');
        if (!IsReceiptCode(normalized)) return Ok({ Found: false, Counted: false });
        const sys = SystemContext(ctx);
        const res = await RunViewOf(sys).RunView<{ Status: string }>(
            {
                EntityName: CAST_BALLOTS,
                ExtraFilter: `ElectionID = ${SqlLiteral(electionID)} AND ReceiptCode = ${SqlLiteral(normalized)}`,
                Fields: ['Status'],
                MaxRows: 1,
                ResultType: 'simple',
            },
            sys.ContextUser
        );
        if (!res.Success) return Fail('LookupFailed', 'The receipt could not be checked.');
        const row = res.Results[0];
        return Ok({ Found: !!row, Counted: row?.Status === 'Counted' });
    }

    // --- internals ---

    private async loadVoter(id: string, sys: VotingContext): Promise<mjBizAppsVotingEligibleVoterEntity | null> {
        const voter = await sys.Provider.GetEntityObject<mjBizAppsVotingEligibleVoterEntity>(ELIGIBLE_VOTERS, sys.ContextUser);
        return (await voter.Load(id)) ? voter : null;
    }

    private async findParticipation(electionID: string, voterID: string, sys: VotingContext): Promise<mjBizAppsVotingParticipationEntity | null> {
        const res = await RunViewOf(sys).RunView<mjBizAppsVotingParticipationEntity>(
            {
                EntityName: PARTICIPATIONS,
                ExtraFilter: `ElectionID = ${SqlLiteral(electionID)} AND EligibleVoterID = ${SqlLiteral(voterID)}`,
                MaxRows: 1,
                ResultType: 'entity_object',
            },
            sys.ContextUser
        );
        return res.Success && res.Results[0] ? res.Results[0] : null;
    }

    /** The voter's current Counted ballot, through attribution. Null in Secret mode (there is none to find). */
    private async findCurrentBallot(participationID: string, sys: VotingContext): Promise<mjBizAppsVotingCastBallotEntity | null> {
        const rv = RunViewOf(sys);
        const attrs = await rv.RunView<{ CastBallotID: string }>(
            { EntityName: ATTRIBUTIONS, ExtraFilter: `ParticipationID = ${SqlLiteral(participationID)}`, Fields: ['CastBallotID'], ResultType: 'simple' },
            sys.ContextUser
        );
        if (!attrs.Success || attrs.Results.length === 0) return null;
        const ids = attrs.Results.map((a) => SqlLiteral(a.CastBallotID)).join(',');
        const ballots = await rv.RunView<mjBizAppsVotingCastBallotEntity>(
            { EntityName: CAST_BALLOTS, ExtraFilter: `ID IN (${ids}) AND Status = 'Counted'`, MaxRows: 1, ResultType: 'entity_object' },
            sys.ContextUser
        );
        return ballots.Success && ballots.Results[0] ? ballots.Results[0] : null;
    }

    private async writeBallot(a: {
        p: CastParams;
        graph: ElectionGraph;
        style: BallotStyle;
        voter: mjBizAppsVotingEligibleVoterEntity;
        weightClass: string;
        selections: string;
        existingParticipationID: string | null;
        ctx: VotingContext;
    }): Promise<EngineResult<{ ReceiptCode: string }>> {
        const { p, graph, style, voter, ctx } = a;
        const election = graph.Election;
        const sys = SystemContext(ctx);
        const receipt = GenerateReceiptCode();

        return BallotBoxWriteGuard.RunWithBallotBoxAccess(async () => {
            const scope = await BeginTransaction(ctx);
            if (!scope) return Fail<{ ReceiptCode: string }>('TransactionsUnsupported', 'This provider cannot run the ballot transaction.');
            try {
                let participationID = a.existingParticipationID;
                let tallyDeltas: TallyDelta[] = [];
                const tallying = MaintainsRunningTally(election.ResultsTiming, election.AssuranceTier);

                if (participationID) {
                    // Revote: supersede the previous ballot; take its counts back out of the running tallies.
                    const previous = await this.findCurrentBallot(participationID, sys);
                    if (!previous) throw new CastAbort('AlreadyVoted', 'You have already voted in this election.');
                    if (tallying) {
                        const old = JSON.parse(await DecryptSelections(previous.Selections, graph)) as BallotSubmission;
                        tallyDeltas.push(...PlanTallyDeltas(style, old, voter.Weight, -1));
                    }
                    previous.Status = 'Superseded';
                    if (!(await previous.Save())) throw new CastAbort('CastFailed', 'The previous ballot could not be superseded.');
                    await this.deleteComments(participationID, sys);
                } else {
                    participationID = await this.insertParticipation(p, voter, sys);
                }

                const ballot = await sys.Provider.GetEntityObject<mjBizAppsVotingCastBallotEntity>(CAST_BALLOTS, sys.ContextUser);
                ballot.NewRecord();
                ballot.ElectionID = election.ID;
                ballot.BallotStyleHash = p.BallotStyleHash;
                ballot.ReceiptCode = receipt;
                ballot.Selections = a.selections;
                ballot.VotingClass = voter.VotingClass;
                ballot.WeightClass = a.weightClass;
                ballot.Status = 'Counted';
                if (!(await ballot.Save())) throw new CastAbort('CastFailed', 'The ballot could not be recorded.');

                if (NeedsAttribution(election.SecrecyMode)) {
                    const attr = await sys.Provider.GetEntityObject<mjBizAppsVotingBallotAttributionEntity>(ATTRIBUTIONS, sys.ContextUser);
                    attr.NewRecord();
                    attr.CastBallotID = ballot.ID;
                    attr.ParticipationID = participationID;
                    if (!(await attr.Save())) throw new CastAbort('CastFailed', 'The ballot could not be recorded.');
                }

                if (tallying) {
                    tallyDeltas.push(...PlanTallyDeltas(style, p.Submission, voter.Weight, 1));
                    await this.applyTallyDeltas(MergeTallyDeltas(tallyDeltas), sys);
                }

                if (election.SecrecyMode === 'Open') await this.writeComments(p.Submission, style, participationID, sys);

                await scope.Commit();
                return Ok({ ReceiptCode: receipt });
            } catch (e) {
                await this.rollbackQuietly(scope);
                if (e instanceof CastAbort) return Fail<{ ReceiptCode: string }>(e.Code, e.message);
                throw e;
            }
        });
    }

    private async rollbackQuietly(scope: { Rollback(): Promise<void> }): Promise<void> {
        try {
            await scope.Rollback();
        } catch {
            LogError('CastEngine: rollback failed.');
        }
    }

    private async insertParticipation(p: CastParams, voter: mjBizAppsVotingEligibleVoterEntity, sys: VotingContext): Promise<string> {
        const part = await sys.Provider.GetEntityObject<mjBizAppsVotingParticipationEntity>(PARTICIPATIONS, sys.ContextUser);
        part.NewRecord();
        part.ElectionID = p.ElectionID;
        part.EligibleVoterID = voter.ID;
        part.CastAt = new Date();
        part.Channel = p.Channel;
        part.VoterCredentialMethodID = p.CredentialMethodID ?? null;
        part.EnteredByUserID = p.EnteredByUserID ?? null;
        part.ProxyDesignationID = p.ProxyDesignationID ?? null;
        if (!(await part.Save())) {
            if (IsUniqueViolation(part.LatestResult?.CompleteMessage)) throw new CastAbort('AlreadyVoted', 'You have already voted in this election.');
            throw new CastAbort('CastFailed', 'The ballot could not be recorded.');
        }
        return part.ID;
    }

    private async applyTallyDeltas(deltas: TallyDelta[], sys: VotingContext): Promise<void> {
        const rv = RunViewOf(sys);
        for (const d of deltas) {
            const optionFilter = d.OptionID ? `ContestOptionID = ${SqlLiteral(d.OptionID)}` : 'ContestOptionID IS NULL';
            const found = await rv.RunView<mjBizAppsVotingContestRunningTallyEntity>(
                { EntityName: RUNNING_TALLIES, ExtraFilter: `ContestID = ${SqlLiteral(d.ContestID)} AND ${optionFilter}`, MaxRows: 1, ResultType: 'entity_object' },
                sys.ContextUser
            );
            if (!found.Success) throw new CastAbort('CastFailed', 'The running tally could not be read.');
            let row = found.Results[0];
            if (!row) {
                row = await sys.Provider.GetEntityObject<mjBizAppsVotingContestRunningTallyEntity>(RUNNING_TALLIES, sys.ContextUser);
                row.NewRecord();
                row.ContestID = d.ContestID;
                row.ContestOptionID = d.OptionID;
                row.VoteCount = 0;
            }
            row.VoteCount = Math.max(0, row.VoteCount + d.Delta);
            if (!(await row.Save())) throw new CastAbort('CastFailed', 'The running tally could not be updated.');
        }
    }

    private async deleteComments(participationID: string, sys: VotingContext): Promise<void> {
        const res = await RunViewOf(sys).RunView<mjBizAppsVotingBallotCommentEntity>(
            { EntityName: COMMENTS, ExtraFilter: `ParticipationID = ${SqlLiteral(participationID)}`, ResultType: 'entity_object' },
            sys.ContextUser
        );
        if (!res.Success) throw new CastAbort('CastFailed', 'Earlier comments could not be read.');
        for (const c of res.Results) {
            if (!(await c.Delete())) throw new CastAbort('CastFailed', 'Earlier comments could not be replaced.');
        }
    }

    private async writeComments(submission: BallotSubmission, style: BallotStyle, participationID: string, sys: VotingContext): Promise<void> {
        for (const contest of style.Contests) {
            if (contest.Kind !== 'StandardsItem') continue;
            const sub = submission.Contests.find((c) => c.ContestID === contest.ContestID);
            const comments = sub?.Comments ?? [];
            let sequence = 1;
            for (const c of comments) {
                const row = await sys.Provider.GetEntityObject<mjBizAppsVotingBallotCommentEntity>(COMMENTS, sys.ContextUser);
                row.NewRecord();
                row.ContestID = contest.ContestID;
                row.ParticipationID = participationID;
                row.Sequence = sequence++;
                row.CommentType = c.CommentType;
                row.DocumentReference = c.DocumentReference ?? null;
                row.Comment = c.Comment;
                row.ProposedChange = c.ProposedChange ?? null;
                if (!(await row.Save())) throw new CastAbort('CastFailed', 'A comment could not be recorded.');
            }
        }
    }
}

export { IsRankedMethod };
