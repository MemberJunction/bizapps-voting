/**
 * VoterRollEngine: freezes the voter roll from a pluggable eligibility source, amends and challenges it with an audit
 * trail, takes proxy designations, and answers weight questions for the tally.
 */

import { BaseSingleton, MJGlobal, UUIDsEqual } from '@memberjunction/global';
import {
    ContestAppliesToVoter,
    type mjBizAppsVotingElectionEntity,
    type mjBizAppsVotingEligibleVoterEntity,
    type mjBizAppsVotingProxyDesignationEntity,
    type VotingAmendRollInput,
    type VotingChallengeVoterInput,
    type VotingDecideProxyInput,
    type VotingSubmitProxyInput,
} from '@mj-biz-apps/voting-entities';
import { VotingEngineBase } from '@mj-biz-apps/voting-engine-base';
import {
    BaseEligibilitySource,
    BindTypeDriver,
    ComputeRollHash,
    DedupeRoll,
    LoadElectionEntity,
    MergeSettings,
    NormalizeWeight,
    ParseJsonObject,
    type RollChangeContext,
    type RollEntry,
    type UnmatchedRow,
} from '../eligibility/index.js';
import { type ElectionGraph, BeginTransaction, ElectionAudit, type EngineResult, Fail, Ok, SqlLiteral, SystemContext, type VoterIdentity, type VotingContext, RunViewOf, IsFailure, PassFailure } from '../shared/index.js';

const ELIGIBLE_VOTERS_ENTITY = 'MJ_BizApps_Voting: Eligible Voters';
const PARTICIPATIONS_ENTITY = 'MJ_BizApps_Voting: Participations';
const PROXIES_ENTITY = 'MJ_BizApps_Voting: Proxy Designations';
const PEOPLE_ENTITY = 'MJ_BizApps_Common: People';

/** Roll changes are possible until the election closes. */
const ROLL_EDITABLE_STATUSES: ReadonlySet<string> = new Set(['Draft', 'Nominations', 'Ready', 'Open']);

/** How many source rows a freeze left out (reasons by row number only; no personal data). */
export interface FreezeRollValue {
    VoterCount: number;
    RollHash: string;
    Unmatched: UnmatchedRow[];
}

interface ExistingVoterRow {
    ID: string;
    PersonID: string;
    RepresentingOrganizationID: string | null;
    VotingClass: string | null;
    Weight: number;
    SourceKey: string | null;
    Status: string;
}

/**
 * Why a proxy designation cannot be decided, or null when it can. Only a Pending designation is decided, and only
 * while the election has not closed.
 */
export function ProxyDecisionProblem(
    designationStatus: string,
    electionStatus: string,
    decision: string
): { Code: string; Message: string } | null {
    if (decision !== 'Accepted' && decision !== 'Rejected') return { Code: 'InvalidDecision', Message: 'The decision must be Accepted or Rejected.' };
    if (!ROLL_EDITABLE_STATUSES.has(electionStatus)) return { Code: 'InvalidStatus', Message: `Proxies can be decided only before the election closes; it is ${electionStatus}.` };
    if (designationStatus !== 'Pending') return { Code: 'AlreadyDecided', Message: `The proxy designation is ${designationStatus} and can no longer be decided.` };
    return null;
}

export class VoterRollEngine extends BaseSingleton<VoterRollEngine> {
    protected constructor() {
        super();
    }

    public static get Instance(): VoterRollEngine {
        return super.getInstance<VoterRollEngine>();
    }

    // ─── Freeze ────────────────────────────────────────────────────────────

    /**
     * Builds the roll as of the record date from the election's eligibility source, stores it, and stamps
     * RollFrozenAt / RollHash. Refused when the roll is already frozen.
     */
    public async FreezeRoll(electionID: string, ctx: VotingContext): Promise<EngineResult<FreezeRollValue>> {
        const loaded = await LoadElectionEntity(electionID, ctx);
        if (IsFailure(loaded)) return PassFailure(loaded);
        const election = loaded.Value;
        if (election.RollFrozenAt) return Fail('AlreadyFrozen', 'The voter roll is already frozen.');
        if (!ROLL_EDITABLE_STATUSES.has(election.Status)) return Fail('InvalidStatus', `The roll cannot be frozen while the election is ${election.Status}.`);

        const bound = await BindTypeDriver(election, ctx);
        if (IsFailure(bound)) return PassFailure(bound);
        const { Driver, Base } = bound.Value;
        const rollContext: RollChangeContext = { ...Base, Action: 'Freeze' };
        const refusal = await Driver.ValidateRollChange(rollContext);
        if (refusal) return Fail('RollChangeRefused', refusal);

        const built = await this.buildFromSource(election, ctx);
        if (IsFailure(built)) return PassFailure(built);
        const { Entries, Unmatched, SourceCode } = built.Value;

        try {
            const existing = await this.loadVoters(election.ID, ctx);
            const existingKeys = new Set(existing.map((v) => this.keyOf(v.PersonID, v.RepresentingOrganizationID)));
            const toInsert = Entries.filter((e) => !existingKeys.has(this.keyOf(e.PersonID, e.RepresentingOrganizationID)));
            const finalRoll: RollEntry[] = [
                ...existing.filter((v) => v.Status !== 'Removed').map((v) => this.toEntry(v)),
                ...toInsert,
            ];
            if (finalRoll.length === 0) return Fail('EmptyRoll', 'The eligibility source produced no voters; the roll was not frozen.');
            const rollHash = ComputeRollHash(finalRoll);

            await this.inTransaction(ctx, async () => {
                for (const entry of toInsert) await this.insertVoter(election.ID, entry, false, ctx);
                election.RollFrozenAt = new Date();
                election.RollHash = rollHash;
                if (!(await election.Save())) throw new Error(`Could not record the frozen roll on the election: ${election.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                await Driver.OnRollFrozen(rollContext);
            });

            await ElectionAudit.Record(ctx, election.ID, 'RollFrozen', {
                VoterCount: finalRoll.length,
                RollHash: rollHash,
                Source: SourceCode,
                UnmatchedRows: Unmatched.length,
            });
            return Ok({ VoterCount: finalRoll.length, RollHash: rollHash, Unmatched });
        } catch (e) {
            return Fail('FreezeFailed', e instanceof Error ? e.message : String(e));
        }
    }

    private async buildFromSource(
        election: mjBizAppsVotingElectionEntity,
        ctx: VotingContext
    ): Promise<EngineResult<{ Entries: RollEntry[]; Unmatched: UnmatchedRow[]; SourceCode: string }>> {
        const engine = VotingEngineBase.Instance;
        await engine.Config(false, ctx.ContextUser, ctx.Provider);
        if (!election.EligibilitySourceTypeID) return Fail('NoEligibilitySource', 'The election has no eligibility source.');
        const sourceType = engine.GetEligibilitySourceTypeByID(election.EligibilitySourceTypeID);
        if (!sourceType) return Fail('EligibilitySourceNotFound', 'The election eligibility source type was not found.');
        if (sourceType.Status !== 'Active') return Fail('EligibilitySourceDisabled', `The eligibility source "${sourceType.Name}" is disabled.`);

        const attempt = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseEligibilitySource>(BaseEligibilitySource, sourceType.DriverClass);
        if (!attempt || !attempt.Resolved || !attempt.Instance) {
            return Fail('DriverNotRegistered', `The eligibility source class "${sourceType.DriverClass}" is not registered on the server.`);
        }
        const settings = MergeSettings(ParseJsonObject(sourceType.Configuration), ParseJsonObject(election.EligibilitySourceSettings));
        const recordDate = election.RecordDate ?? new Date();
        try {
            const report = await attempt.Instance.BuildRollReport(settings, recordDate, ctx);
            const deduped = DedupeRoll(report.Entries);
            const dropped: UnmatchedRow[] = deduped.Dropped > 0 ? [{ Row: 0, Reason: `${deduped.Dropped} entries dropped (no person or weight not above zero)` }] : [];
            return Ok({ Entries: deduped.Entries, Unmatched: [...report.Unmatched, ...dropped], SourceCode: sourceType.Code });
        } catch (e) {
            return Fail('RollBuildFailed', e instanceof Error ? e.message : String(e));
        }
    }

    // ─── Amend ─────────────────────────────────────────────────────────────

    /** Adds and removes voters. After the freeze, additions are flagged AddedAfterFreeze. Removing a voter who has already voted is refused. */
    public async AmendRoll(input: VotingAmendRollInput, ctx: VotingContext): Promise<EngineResult<{ Added: number; Removed: number }>> {
        const loaded = await LoadElectionEntity(input.ElectionID, ctx);
        if (IsFailure(loaded)) return PassFailure(loaded);
        const election = loaded.Value;
        if (!ROLL_EDITABLE_STATUSES.has(election.Status)) return Fail('InvalidStatus', `The roll cannot be changed while the election is ${election.Status}.`);
        const additions = input.Add ?? [];
        const removals = input.Remove ?? [];
        if (additions.length === 0 && removals.length === 0) return Fail('NothingToDo', 'No additions or removals were given.');
        if (removals.some((r) => !r.Reason?.trim())) return Fail('ReasonRequired', 'Every removal needs a reason.');
        if (additions.some((a) => a.Weight !== undefined && !(a.Weight > 0))) return Fail('InvalidWeight', 'A voter weight must be greater than zero.');

        const bound = await BindTypeDriver(election, ctx);
        if (IsFailure(bound)) return PassFailure(bound);
        const refusal = await bound.Value.Driver.ValidateRollChange({ ...bound.Value.Base, Action: 'Amend' });
        if (refusal) return Fail('RollChangeRefused', refusal);

        const afterFreeze = election.RollFrozenAt !== null;
        try {
            let added = 0;
            let removed = 0;
            await this.inTransaction(ctx, async () => {
                const existing = await this.loadVoters(election.ID, ctx);
                for (const addition of additions) {
                    const orgID = addition.RepresentingOrganizationID?.trim() ? addition.RepresentingOrganizationID : null;
                    const match = existing.find((v) => this.keyOf(v.PersonID, v.RepresentingOrganizationID) === this.keyOf(addition.PersonID, orgID));
                    if (match) {
                        if (match.Status !== 'Removed') continue; // already on the roll
                        await this.setStatus(match.ID, 'Eligible', 'Reinstated by roll amendment', ctx);
                        added++;
                        continue;
                    }
                    await this.insertVoter(
                        election.ID,
                        {
                            PersonID: addition.PersonID,
                            RepresentingOrganizationID: orgID,
                            VotingClass: addition.VotingClass?.trim() || null,
                            Weight: addition.Weight ?? 1,
                            SourceKey: addition.SourceKey?.trim() || null,
                        },
                        afterFreeze,
                        ctx
                    );
                    added++;
                }
                for (const removal of removals) {
                    const voter = await this.loadVoterEntity(removal.EligibleVoterID, ctx);
                    if (!voter || !UUIDsEqual(voter.ElectionID, election.ID)) throw new RollError('VoterNotFound', 'A voter to remove is not on this election\'s roll.');
                    if (voter.Status === 'Removed') continue;
                    if (await this.hasParticipated(election.ID, voter.ID, ctx)) throw new RollError('AlreadyVoted', 'A voter who has already voted cannot be removed from the roll.');
                    voter.Status = 'Removed';
                    voter.StatusReason = removal.Reason.trim();
                    if (!(await voter.Save())) throw new Error(`Could not remove a voter: ${voter.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                    removed++;
                }
            });
            await ElectionAudit.Record(ctx, election.ID, 'RollAmended', { Added: added, Removed: removed, AfterFreeze: afterFreeze });
            return Ok({ Added: added, Removed: removed });
        } catch (e) {
            return this.failFrom(e, 'AmendFailed');
        }
    }

    // ─── Challenge ─────────────────────────────────────────────────────────

    /**
     * Challenges a voter (Status Challenged: they cannot sign in or vote until decided). With a Decision the challenge is
     * settled at once: Uphold removes the voter, Reject returns them to Eligible. A challenged voter can be decided later by
     * calling again with a Decision.
     */
    public async ChallengeVoter(input: VotingChallengeVoterInput, ctx: VotingContext): Promise<EngineResult<{ Status: string }>> {
        if (!input.Reason?.trim()) return Fail('ReasonRequired', 'A challenge needs a reason.');
        const voter = await this.loadVoterEntity(input.EligibleVoterID, ctx);
        if (!voter) return Fail('VoterNotFound', 'The voter was not found.');
        const loaded = await LoadElectionEntity(voter.ElectionID, ctx);
        if (IsFailure(loaded)) return PassFailure(loaded);
        const election = loaded.Value;
        if (!ROLL_EDITABLE_STATUSES.has(election.Status)) return Fail('InvalidStatus', `Voters cannot be challenged while the election is ${election.Status}.`);
        if (voter.Status === 'Removed') return Fail('InvalidState', 'This voter has already been removed from the roll.');
        if (!input.Decision && voter.Status === 'Challenged') return Fail('InvalidState', 'This voter is already challenged.');

        const bound = await BindTypeDriver(election, ctx);
        if (IsFailure(bound)) return PassFailure(bound);
        const refusal = await bound.Value.Driver.ValidateRollChange({ ...bound.Value.Base, Action: 'Challenge', oldValues: { Status: voter.Status } });
        if (refusal) return Fail('RollChangeRefused', refusal);

        try {
            const reason = input.Reason.trim();
            let event: string;
            if (input.Decision === 'Uphold') {
                if (await this.hasParticipated(election.ID, voter.ID, ctx)) return Fail('AlreadyVoted', 'A voter who has already voted cannot be removed from the roll.');
                voter.Status = 'Removed';
                event = 'ChallengeUpheld';
            } else if (input.Decision === 'Reject') {
                voter.Status = 'Eligible';
                event = 'ChallengeRejected';
            } else {
                voter.Status = 'Challenged';
                event = 'VoterChallenged';
            }
            voter.StatusReason = reason;
            if (!(await voter.Save())) return Fail('ChallengeFailed', `Could not record the challenge: ${voter.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            await ElectionAudit.Record(ctx, election.ID, event, { EligibleVoterID: voter.ID, Status: voter.Status });
            return Ok({ Status: voter.Status });
        } catch (e) {
            return this.failFrom(e, 'ChallengeFailed');
        }
    }

    // ─── Proxy ─────────────────────────────────────────────────────────────

    /**
     * Records a proxy designation by the signed-in voter. Needs Election.ProxyDeadline to be set and not yet passed.
     * One active (Pending or Accepted) designation per grantor.
     */
    public async SubmitProxy(input: VotingSubmitProxyInput, identity: VoterIdentity, ctx: VotingContext): Promise<EngineResult<{ ProxyDesignationID: string }>> {
        if (!UUIDsEqual(identity.ElectionID, input.ElectionID)) return Fail('WrongElection', 'This session is not for this election.');
        const system = SystemContext(ctx); // a guest ballot session cannot write these tables itself; identity is what authorizes this
        const loaded = await LoadElectionEntity(input.ElectionID, system);
        if (IsFailure(loaded)) return PassFailure(loaded);
        const election = loaded.Value;
        if (!['Nominations', 'Ready', 'Open'].includes(election.Status)) return Fail('InvalidStatus', `Proxies cannot be designated while the election is ${election.Status}.`);
        if (!election.ProxyDeadline) return Fail('ProxiesNotEnabled', 'This election does not accept proxy designations.');
        if (election.ProxyDeadline.getTime() <= Date.now()) return Fail('ProxyDeadlinePassed', 'The deadline for designating a proxy has passed.');

        const scope = input.Scope?.trim() || 'General';
        if (scope !== 'General' && scope !== 'Directed') return Fail('InvalidScope', 'A proxy scope is General or Directed.');

        const grantor = await this.loadVoterEntity(identity.EligibleVoterID, system);
        if (!grantor || !UUIDsEqual(grantor.ElectionID, election.ID) || grantor.Status !== 'Eligible') {
            return Fail('NotEligible', 'You are not an eligible voter in this election.');
        }
        if (UUIDsEqual(grantor.PersonID, input.ProxyPersonID)) return Fail('InvalidProxy', 'You cannot designate yourself as your proxy.');

        const rv = RunViewOf(system);
        const person = await rv.RunView<{ ID: string }>(
            { EntityName: PEOPLE_ENTITY, ExtraFilter: `ID = ${SqlLiteral(input.ProxyPersonID)}`, Fields: ['ID'], MaxRows: 1, ResultType: 'simple' },
            system.ContextUser
        );
        if (!person.Success || person.Results.length === 0) return Fail('ProxyPersonNotFound', 'The person chosen as proxy was not found.');

        const active = await rv.RunView<{ ID: string }>(
            {
                EntityName: PROXIES_ENTITY,
                ExtraFilter: `ElectionID = ${SqlLiteral(election.ID)} AND GrantorEligibleVoterID = ${SqlLiteral(grantor.ID)} AND Status IN ('Pending', 'Accepted')`,
                Fields: ['ID'],
                MaxRows: 1,
                ResultType: 'simple',
            },
            system.ContextUser
        );
        if (!active.Success) return Fail('ProxyLookupFailed', 'Could not check existing proxy designations.');
        if (active.Results.length > 0) return Fail('ProxyAlreadyDesignated', 'You already have an active proxy designation; revoke it first.');

        const row = await system.Provider.GetEntityObject<mjBizAppsVotingProxyDesignationEntity>(PROXIES_ENTITY, system.ContextUser);
        row.NewRecord();
        row.ElectionID = election.ID;
        row.GrantorEligibleVoterID = grantor.ID;
        row.ProxyPersonID = input.ProxyPersonID;
        row.Scope = scope;
        row.Instructions = input.Instructions?.trim() || null;
        row.ReceivedAt = new Date();
        row.Status = 'Pending';
        if (!(await row.Save())) return Fail('ProxyFailed', `Could not record the proxy designation: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        await ElectionAudit.Record(ctx, election.ID, 'ProxyDesignated', { ProxyDesignationID: row.ID, Scope: scope });
        return Ok({ ProxyDesignationID: row.ID });
    }

    /**
     * An administrator accepts or rejects a Pending proxy designation. Allowed only before the election closes. The
     * decision (and any notes) is written to the audit trail; the designation row has no notes column of its own.
     */
    public async DecideProxy(input: VotingDecideProxyInput, ctx: VotingContext): Promise<EngineResult<{ Status: string }>> {
        const row = await ctx.Provider.GetEntityObject<mjBizAppsVotingProxyDesignationEntity>(PROXIES_ENTITY, ctx.ContextUser);
        if (!(await row.Load(input.ProxyDesignationID))) return Fail('ProxyNotFound', 'The proxy designation was not found.');
        const loaded = await LoadElectionEntity(row.ElectionID, ctx);
        if (IsFailure(loaded)) return PassFailure(loaded);
        const problem = ProxyDecisionProblem(row.Status, loaded.Value.Status, input.Decision);
        if (problem) return Fail(problem.Code, problem.Message);
        row.Status = input.Decision;
        if (!(await row.Save())) return Fail('ProxyDecisionFailed', `Could not record the decision: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        await ElectionAudit.Record(ctx, row.ElectionID, 'ProxyDecided', {
            ProxyDesignationID: row.ID,
            Decision: input.Decision,
            ...(input.Notes?.trim() ? { Notes: input.Notes.trim() } : {}),
        });
        return Ok({ Status: row.Status });
    }

    // ─── Reads ─────────────────────────────────────────────────────────────

    /** Total eligible weight per contest: Eligible voters whose class the contest applies to. */
    public async GetEligibleWeightByContest(graph: ElectionGraph, ctx: VotingContext): Promise<Record<string, number>> {
        const rv = RunViewOf(ctx);
        const result = await rv.RunView<{ VotingClass: string | null; Weight: number }>(
            {
                EntityName: ELIGIBLE_VOTERS_ENTITY,
                ExtraFilter: `ElectionID = ${SqlLiteral(graph.Election.ID)} AND Status = 'Eligible'`,
                Fields: ['VotingClass', 'Weight'],
                ResultType: 'simple',
            },
            ctx.ContextUser
        );
        if (!result.Success) throw new Error(`Could not read the voter roll: ${result.ErrorMessage}`);
        const totals: Record<string, number> = {};
        for (const contest of graph.Contests) {
            const filter = graph.ContestVotingClassFilters[contest.ID] ?? null;
            let sum = 0;
            for (const voter of result.Results) {
                if (ContestAppliesToVoter(filter, voter.VotingClass)) sum += Number(voter.Weight);
            }
            totals[contest.ID] = NormalizeWeight(sum);
        }
        return totals;
    }

    /** One roll entry. */
    public async GetVoter(eligibleVoterID: string, ctx: VotingContext): Promise<EngineResult<mjBizAppsVotingEligibleVoterEntity>> {
        const voter = await this.loadVoterEntity(eligibleVoterID, ctx);
        return voter ? Ok(voter) : Fail('VoterNotFound', 'The voter was not found.');
    }

    // ─── Internals ─────────────────────────────────────────────────────────

    /**
     * Runs the work in one transaction (all rows or none). A provider without transaction support is
     * refused rather than run row by row: a half-written roll would freeze an election on the wrong voters.
     */
    private async inTransaction(ctx: VotingContext, work: () => Promise<void>): Promise<void> {
        const scope = await BeginTransaction(ctx);
        if (!scope) {
            throw new Error('This provider cannot run the voter-roll transaction.');
        }
        try {
            await work();
            await scope.Commit();
        } catch (e) {
            await scope.Rollback();
            throw e;
        }
    }

    private keyOf(personID: string, organizationID: string | null | undefined): string {
        return `${personID.trim().toLowerCase()}|${(organizationID ?? '').trim().toLowerCase()}`;
    }

    private toEntry(row: ExistingVoterRow): RollEntry {
        return {
            PersonID: row.PersonID,
            RepresentingOrganizationID: row.RepresentingOrganizationID,
            VotingClass: row.VotingClass,
            Weight: Number(row.Weight),
            SourceKey: row.SourceKey,
        };
    }

    private async loadVoters(electionID: string, ctx: VotingContext): Promise<ExistingVoterRow[]> {
        const rv = RunViewOf(ctx);
        const result = await rv.RunView<ExistingVoterRow>(
            {
                EntityName: ELIGIBLE_VOTERS_ENTITY,
                ExtraFilter: `ElectionID = ${SqlLiteral(electionID)}`,
                Fields: ['ID', 'PersonID', 'RepresentingOrganizationID', 'VotingClass', 'Weight', 'SourceKey', 'Status'],
                ResultType: 'simple',
            },
            ctx.ContextUser
        );
        if (!result.Success) throw new Error(`Could not read the voter roll: ${result.ErrorMessage}`);
        return result.Results;
    }

    private async loadVoterEntity(eligibleVoterID: string, ctx: VotingContext): Promise<mjBizAppsVotingEligibleVoterEntity | null> {
        const voter = await ctx.Provider.GetEntityObject<mjBizAppsVotingEligibleVoterEntity>(ELIGIBLE_VOTERS_ENTITY, ctx.ContextUser);
        return (await voter.Load(eligibleVoterID)) ? voter : null;
    }

    private async insertVoter(electionID: string, entry: RollEntry, addedAfterFreeze: boolean, ctx: VotingContext): Promise<void> {
        const voter = await ctx.Provider.GetEntityObject<mjBizAppsVotingEligibleVoterEntity>(ELIGIBLE_VOTERS_ENTITY, ctx.ContextUser);
        voter.NewRecord();
        voter.ElectionID = electionID;
        voter.PersonID = entry.PersonID;
        voter.RepresentingOrganizationID = entry.RepresentingOrganizationID;
        voter.VotingClass = entry.VotingClass;
        voter.Weight = NormalizeWeight(entry.Weight);
        voter.SourceKey = entry.SourceKey;
        voter.Status = 'Eligible';
        voter.AddedAfterFreeze = addedAfterFreeze;
        if (!(await voter.Save())) throw new Error(`Could not add a voter to the roll: ${voter.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }

    private async setStatus(eligibleVoterID: string, status: 'Eligible' | 'Challenged' | 'Removed', reason: string, ctx: VotingContext): Promise<void> {
        const voter = await this.loadVoterEntity(eligibleVoterID, ctx);
        if (!voter) throw new RollError('VoterNotFound', 'The voter was not found.');
        voter.Status = status;
        voter.StatusReason = reason;
        if (!(await voter.Save())) throw new Error(`Could not update a voter: ${voter.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }

    private async hasParticipated(electionID: string, eligibleVoterID: string, ctx: VotingContext): Promise<boolean> {
        const rv = RunViewOf(ctx);
        const result = await rv.RunView<{ ID: string }>(
            {
                EntityName: PARTICIPATIONS_ENTITY,
                ExtraFilter: `ElectionID = ${SqlLiteral(electionID)} AND EligibleVoterID = ${SqlLiteral(eligibleVoterID)}`,
                Fields: ['ID'],
                MaxRows: 1,
                ResultType: 'simple',
            },
            ctx.ContextUser
        );
        if (!result.Success) throw new Error(`Could not check participation: ${result.ErrorMessage}`);
        return result.Results.length > 0;
    }

    private failFrom<T>(e: unknown, fallbackCode: string): EngineResult<T> {
        if (e instanceof RollError) return Fail(e.Code, e.message);
        return Fail(fallbackCode, e instanceof Error ? e.message : String(e));
    }
}

/** A refusal raised inside a roll transaction so the transaction rolls back and the caller gets a stable code. */
class RollError extends Error {
    public constructor(
        public readonly Code: string,
        message: string
    ) {
        super(message);
    }
}
