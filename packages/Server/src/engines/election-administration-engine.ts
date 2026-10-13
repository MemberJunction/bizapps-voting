/**
 * ElectionAdministrationEngine: creating and configuring an election, and moving it through
 * Open / Close / Cancel. Status rules live in the entity server subclasses (state machine, configuration lock,
 * driver validation); this engine adds the cross-record checks and the atomic multi-row create.
 */

import { type EntityInfo, LogError } from '@memberjunction/core';
import { BaseSingleton } from '@memberjunction/global';
import { ElectionTypeDriverRegistry } from '@mj-biz-apps/voting-core-entities-server';
import { VotingEngineBase } from '@mj-biz-apps/voting-engine-base';
import {
    CanTransition,
    type ContestKind,
    ResolveElectionConfiguration,
    type ResolvedElectionConfiguration,
    ValidateResolvedConfiguration,
    VOTING_APP_DEFAULTS,
    type VotingContestSpec,
    type VotingCreateElectionInput,
    type VotingUpdateElectionInput,
    type mjBizAppsVotingContestEntity,
    type mjBizAppsVotingContestOptionEntity,
    type mjBizAppsVotingElectionAnchorEntity,
    type mjBizAppsVotingElectionEntity,
} from '@mj-biz-apps/voting-entities';
import { ElectionAudit } from '../shared/audit.js';
import { LoadElectionGraph } from '../shared/election-graph.js';
import { BeginTransaction, type EngineResult, Fail, IsFailure, Ok, PassFailure, type VotingContext } from '../shared/types.js';
import { BallotStyleBuilder, DEFAULT_BALLOT_LANGUAGE } from './ballot-style-builder.js';
import { VoterRollEngine } from './voter-roll-engine.js';

const ELECTIONS = 'MJ_BizApps_Voting: Elections';
const CONTESTS = 'MJ_BizApps_Voting: Contests';
const OPTIONS = 'MJ_BizApps_Voting: Contest Options';
const ANCHORS = 'MJ_BizApps_Voting: Election Anchors';

/** Aborts a transactional create with a stable code. */
class AdminAbort extends Error {
    constructor(public readonly Code: string, message: string) {
        super(message);
    }
}

// === Pure helpers (unit-tested) ===

/** Contest kinds that are decided by a threshold; the rest (offices) are won by votes. */
const THRESHOLD_KINDS: ReadonlyArray<ContestKind> = ['Motion', 'Amendment', 'Question', 'StandardsItem'];

/** Default threshold for a contest kind when the spec gives none. */
export function DefaultThreshold(kind: ContestKind): 'Majority' | 'None' {
    return THRESHOLD_KINDS.includes(kind) ? 'Majority' : 'None';
}

/** The options a contest is created with: the spec's, or Yes/No (Approve/Disapprove for standards items) for yes/no kinds. */
export function EffectiveOptions(spec: VotingContestSpec): Array<{ Label: string; Description?: string; CandidatePersonID?: string; IsWriteIn?: boolean }> {
    if (spec.Options && spec.Options.length > 0) return spec.Options;
    if (spec.Kind === 'StandardsItem') return [{ Label: 'Approve' }, { Label: 'Disapprove' }];
    if (THRESHOLD_KINDS.includes(spec.Kind)) return [{ Label: 'Yes' }, { Label: 'No' }];
    return [];
}

/** Problems with a create request that need no database. Empty when fine. */
export function ValidateCreateInput(input: VotingCreateElectionInput, resolved: ResolvedElectionConfiguration): string[] {
    const problems: string[] = [];
    if (!input.Name?.trim()) problems.push('The election needs a name.');
    if (!input.Contests || input.Contests.length === 0) problems.push('The election needs at least one contest.');
    const allowed = resolved.AllowedContestKinds;
    input.Contests?.forEach((c, i) => {
        if (!c.Name?.trim()) problems.push(`Contest ${i + 1} needs a name.`);
        if (allowed && !allowed.includes(c.Kind)) problems.push(`Contest "${c.Name}" has kind ${c.Kind}, which this election type does not allow.`);
        const options = EffectiveOptions(c);
        if (options.length === 0 && !c.AllowWriteIn && c.Kind === 'Office') {
            // Offices may be created without candidates while nominations are open; they must have some before Open.
        }
        if (c.MinSelections !== undefined && c.MaxSelections !== undefined && c.MinSelections > c.MaxSelections) {
            problems.push(`Contest "${c.Name}": MinSelections exceeds MaxSelections.`);
        }
    });
    if (input.OpensAt && input.ClosesAt && new Date(input.OpensAt).getTime() >= new Date(input.ClosesAt).getTime()) {
        problems.push('OpensAt must be before ClosesAt.');
    }
    return problems;
}

/** What blocks opening an election (beyond the status rule). Empty when ready. */
export function OpenReadinessProblems(p: {
    AssuranceTier: string;
    ElectionPublicKey: string | null;
    Contests: Array<{ Name: string; AllowWriteIn: boolean; ActiveOptionCount: number }>;
}): string[] {
    const problems: string[] = [];
    if (p.AssuranceTier === 'Verifiable') problems.push('The Verifiable assurance tier needs an ElectionGuard provider, which is not registered.');
    if (p.AssuranceTier === 'HighAssurance' && !p.ElectionPublicKey) problems.push('A HighAssurance election needs its trustee key ceremony before it can open.');
    if (p.Contests.length === 0) problems.push('The election has no contests.');
    for (const c of p.Contests) {
        if (c.ActiveOptionCount === 0 && !c.AllowWriteIn) problems.push(`Contest "${c.Name}" has no options.`);
    }
    return problems;
}

function toDate(value: string | undefined): Date | null {
    return value ? new Date(value) : null;
}

export class ElectionAdministrationEngine extends BaseSingleton<ElectionAdministrationEngine> {
    protected constructor() {
        super();
    }

    public static get Instance(): ElectionAdministrationEngine {
        return super.getInstance<ElectionAdministrationEngine>();
    }

    /** Creates the election with its anchors, contests and options in one transaction. Starts in Draft. */
    public async CreateElection(input: VotingCreateElectionInput, ctx: VotingContext): Promise<EngineResult<{ ElectionID: string }>> {
        const engine = VotingEngineBase.Instance;
        await engine.Config(false, ctx.ContextUser, ctx.Provider);
        const type = engine.GetElectionTypeByCode(input.ElectionTypeCode);
        if (!type) return Fail('UnknownElectionType', `Unknown election type "${input.ElectionTypeCode}".`);
        const source = engine.GetEligibilitySourceTypeByCode(input.EligibilitySource?.Code);
        if (!source) return Fail('UnknownEligibilitySource', `Unknown eligibility source "${input.EligibilitySource?.Code}".`);

        const resolved = ResolveElectionConfiguration(VOTING_APP_DEFAULTS, engine.GetElectionTypeConfiguration(type.ID) ?? undefined, input.Configuration);
        const secrecy = input.SecrecyMode ?? resolved.SecrecyMode ?? 'Secret';
        const columns: ResolvedElectionConfiguration = {
            ...resolved,
            SecrecyMode: secrecy,
            AssuranceTier: input.AssuranceTier ?? resolved.AssuranceTier,
            ResultsTiming: input.ResultsTiming ?? resolved.ResultsTiming,
            ResultsAudience: input.ResultsAudience ?? resolved.ResultsAudience,
            AllowRevote: secrecy === 'Secret' ? false : resolved.AllowRevote,
        };
        const problems = [...ValidateCreateInput(input, columns), ...ValidateResolvedConfiguration(columns)];
        const methodIDs: string[] = [];
        for (const c of input.Contests ?? []) {
            const code = c.TallyMethodCode || columns.DefaultTallyMethodCode || '';
            const method = engine.GetTallyMethodByCode(code);
            if (!method) problems.push(`Contest "${c.Name}": unknown tally method "${code}".`);
            methodIDs.push(method?.ID ?? '');
        }
        if (problems.length > 0) return Fail('InvalidElection', problems.join(' '));

        const scope = await BeginTransaction(ctx);
        if (!scope) return Fail('TransactionsUnsupported', 'This provider cannot run the create transaction.');
        try {
            const election = await ctx.Provider.GetEntityObject<mjBizAppsVotingElectionEntity>(ELECTIONS, ctx.ContextUser);
            election.NewRecord();
            election.Name = input.Name.trim();
            election.Description = input.Description ?? null;
            election.ElectionTypeID = type.ID;
            election.Status = 'Draft';
            election.SecrecyMode = columns.SecrecyMode ?? 'Secret';
            election.AssuranceTier = columns.AssuranceTier ?? 'Standard';
            election.ResultsTiming = columns.ResultsTiming ?? 'AfterClose';
            election.ResultsAudience = columns.ResultsAudience ?? 'Voters';
            election.ResultsMinCast = columns.ResultsMinCast ?? 5;
            election.WeightClassMinSize = columns.WeightClassMinSize ?? 5;
            election.AllowRevote = columns.AllowRevote ?? false;
            election.EligibilitySourceTypeID = source.ID;
            election.EligibilitySourceSettings = input.EligibilitySource.Settings ? JSON.stringify(input.EligibilitySource.Settings) : null;
            election.RecordDate = toDate(input.RecordDate);
            election.OpensAt = toDate(input.OpensAt);
            election.ClosesAt = toDate(input.ClosesAt);
            if (input.TimeZone) election.TimeZone = input.TimeZone;
            election.Configuration = input.Configuration ? JSON.stringify(input.Configuration) : null;
            await this.saveOrAbort(election, 'election');

            await this.createAnchors(election.ID, input, ctx);
            for (let i = 0; i < input.Contests.length; i++) {
                await this.createContest(election.ID, input.Contests[i], i, methodIDs[i], ctx);
            }
            await scope.Commit();
            await ElectionAudit.Record(ctx, election.ID, 'Created', { ElectionTypeCode: type.Code, Contests: input.Contests.length });
            return Ok({ ElectionID: election.ID });
        } catch (e) {
            await this.rollbackQuietly(scope);
            if (e instanceof AdminAbort) return Fail(e.Code, e.message);
            LogError(`ElectionAdministrationEngine.CreateElection failed: ${e instanceof Error ? e.message : String(e)}`);
            return Fail('CreateFailed', 'The election could not be created.');
        }
    }

    /** Updates the fields supplied. The entity server enforces the configuration lock and the state machine. */
    public async UpdateElection(input: VotingUpdateElectionInput, ctx: VotingContext): Promise<EngineResult<{ ElectionID: string }>> {
        const election = await ctx.Provider.GetEntityObject<mjBizAppsVotingElectionEntity>(ELECTIONS, ctx.ContextUser);
        if (!(await election.Load(input.ElectionID))) return Fail('ElectionNotFound', 'The election was not found.');
        const changed: string[] = [];
        const set = <K extends keyof mjBizAppsVotingElectionEntity>(key: K, value: mjBizAppsVotingElectionEntity[K] | undefined): void => {
            if (value !== undefined) {
                election[key] = value;
                changed.push(String(key));
            }
        };
        set('Name', input.Name?.trim());
        set('Description', input.Description);
        set('SecrecyMode', input.SecrecyMode);
        set('AssuranceTier', input.AssuranceTier);
        set('ResultsTiming', input.ResultsTiming);
        set('ResultsAudience', input.ResultsAudience);
        set('OpensAt', input.OpensAt ? new Date(input.OpensAt) : undefined);
        set('ClosesAt', input.ClosesAt ? new Date(input.ClosesAt) : undefined);
        set('TimeZone', input.TimeZone);
        set('Configuration', input.Configuration ? JSON.stringify(input.Configuration) : undefined);
        if (input.SecrecyMode === 'Secret') set('AllowRevote', false);
        if (changed.length === 0) return Ok({ ElectionID: election.ID });
        if (!(await election.Save())) return Fail('UpdateRefused', election.LatestResult?.CompleteMessage ?? 'The election could not be updated.');
        await ElectionAudit.Record(ctx, election.ID, 'Updated', { Fields: changed });
        return Ok({ ElectionID: election.ID });
    }

    /** Draft / Nominations / Ready -> Open. Freezes the roll if needed; validates readiness and the ballot style. */
    public async OpenElection(electionID: string, ctx: VotingContext): Promise<EngineResult<{ Status: string }>> {
        let graphRes = await LoadElectionGraph(electionID, ctx);
        if (IsFailure(graphRes)) return PassFailure(graphRes);
        const status = graphRes.Value.Election.Status;
        // The state machine has no Draft/Nominations -> Open edge; those elections pass through Ready (below).
        if (!CanTransition(status, 'Open') && !(CanTransition(status, 'Ready') && CanTransition('Ready', 'Open'))) {
            return Fail('InvalidTransition', `An election in ${status} status cannot be opened.`);
        }

        if (!graphRes.Value.Election.RollFrozenAt) {
            const frozen = await VoterRollEngine.Instance.FreezeRoll(electionID, ctx);
            if (IsFailure(frozen)) return PassFailure(frozen);
            graphRes = await LoadElectionGraph(electionID, ctx);
            if (IsFailure(graphRes)) return PassFailure(graphRes);
        }
        const graph = graphRes.Value;
        const election = graph.Election;

        const readiness = OpenReadinessProblems({
            AssuranceTier: election.AssuranceTier,
            ElectionPublicKey: election.ElectionPublicKey,
            Contests: graph.Contests.map((c) => ({
                Name: c.Name,
                AllowWriteIn: c.AllowWriteIn,
                ActiveOptionCount: (graph.OptionsByContestID.get(c.ID.toLowerCase()) ?? []).filter((o) => o.Status === 'Active').length,
            })),
        });
        if (readiness.length > 0) return Fail('NotReady', readiness.join(' '));

        const { driver, error } = ElectionTypeDriverRegistry.Instance.GetDriver(graph.ElectionType);
        if (!driver) return Fail('DriverUnavailable', error ?? 'The election type driver is not available.');
        const style = await BallotStyleBuilder.Instance.Build(graph, null, DEFAULT_BALLOT_LANGUAGE, ctx);
        const styleProblem = await driver.ValidateBallotStyle({
            ContextUser: ctx.ContextUser,
            Provider: ctx.Provider,
            Election: election,
            ElectionType: graph.ElectionType,
            Configuration: graph.Configuration,
            Style: style,
        });
        if (styleProblem) return Fail('InvalidBallotStyle', styleProblem);

        if (election.Status !== 'Ready') {
            const ready = await this.transition(election, 'Ready', 'Ready', ctx);
            if (IsFailure(ready)) return ready;
        }
        return this.transition(election, 'Open', 'Opened', ctx);
    }

    /** Open -> Closed. */
    public async CloseElection(electionID: string, ctx: VotingContext): Promise<EngineResult<{ Status: string }>> {
        const election = await ctx.Provider.GetEntityObject<mjBizAppsVotingElectionEntity>(ELECTIONS, ctx.ContextUser);
        if (!(await election.Load(electionID))) return Fail('ElectionNotFound', 'The election was not found.');
        if (!CanTransition(election.Status, 'Closed')) return Fail('InvalidTransition', `An election in ${election.Status} status cannot be closed.`);
        return this.transition(election, 'Closed', 'Closed', ctx);
    }

    /** Any non-final status -> Cancelled, with the reason recorded in the audit trail. */
    public async CancelElection(electionID: string, reason: string, ctx: VotingContext): Promise<EngineResult<{ Status: string }>> {
        const election = await ctx.Provider.GetEntityObject<mjBizAppsVotingElectionEntity>(ELECTIONS, ctx.ContextUser);
        if (!(await election.Load(electionID))) return Fail('ElectionNotFound', 'The election was not found.');
        if (!CanTransition(election.Status, 'Cancelled')) return Fail('InvalidTransition', `An election in ${election.Status} status cannot be cancelled.`);
        return this.transition(election, 'Cancelled', 'Cancelled', ctx, { Reason: reason });
    }

    // --- internals ---

    private async transition(
        election: mjBizAppsVotingElectionEntity,
        to: mjBizAppsVotingElectionEntity['Status'],
        event: string,
        ctx: VotingContext,
        details?: Record<string, unknown>
    ): Promise<EngineResult<{ Status: string }>> {
        const from = election.Status;
        election.Status = to;
        if (!(await election.Save())) {
            return Fail('TransitionRefused', election.LatestResult?.CompleteMessage ?? `The election could not move to ${to}.`);
        }
        await ElectionAudit.Record(ctx, election.ID, event, { From: from, To: to, ...details });
        return Ok({ Status: election.Status });
    }

    private async saveOrAbort(entity: { Save(): Promise<boolean>; LatestResult?: { CompleteMessage?: string } | null }, what: string): Promise<void> {
        if (!(await entity.Save())) {
            throw new AdminAbort('SaveRefused', entity.LatestResult?.CompleteMessage ?? `The ${what} could not be saved.`);
        }
    }

    private async createAnchors(electionID: string, input: VotingCreateElectionInput, ctx: VotingContext): Promise<void> {
        const anchors = input.Anchors ?? [];
        for (let i = 0; i < anchors.length; i++) {
            const a = anchors[i];
            const entity: EntityInfo | undefined = ctx.Provider.EntityByName(a.EntityName);
            if (!entity) throw new AdminAbort('UnknownAnchorEntity', `Unknown anchor entity "${a.EntityName}".`);
            const row = await ctx.Provider.GetEntityObject<mjBizAppsVotingElectionAnchorEntity>(ANCHORS, ctx.ContextUser);
            row.NewRecord();
            row.ElectionID = electionID;
            row.EntityID = entity.ID;
            row.RecordID = a.RecordID;
            if (a.Role) row.Role = a.Role;
            row.IsPrimary = a.IsPrimary ?? i === 0;
            row.Sequence = i + 1;
            await this.saveOrAbort(row, 'anchor');
        }
    }

    private async createContest(electionID: string, spec: VotingContestSpec, index: number, tallyMethodID: string, ctx: VotingContext): Promise<void> {
        const contest = await ctx.Provider.GetEntityObject<mjBizAppsVotingContestEntity>(CONTESTS, ctx.ContextUser);
        contest.NewRecord();
        contest.ElectionID = electionID;
        contest.Name = spec.Name.trim();
        contest.Description = spec.Description ?? null;
        contest.Sequence = index + 1;
        contest.Kind = spec.Kind;
        contest.Seats = spec.Seats ?? 1;
        contest.TallyMethodID = tallyMethodID;
        contest.Threshold = spec.Threshold ?? DefaultThreshold(spec.Kind);
        contest.CustomThreshold = spec.CustomThreshold ?? null;
        contest.ThresholdBasis = spec.ThresholdBasis ?? 'VotesCast';
        contest.AllowAbstain = spec.AllowAbstain ?? spec.Kind !== 'Office';
        contest.AllowWriteIn = spec.AllowWriteIn ?? false;
        contest.MinSelections = spec.MinSelections ?? 0;
        contest.MaxSelections = spec.MaxSelections ?? null;
        contest.VotingClassFilter = spec.VotingClassFilter ?? null;
        await this.saveOrAbort(contest, 'contest');

        const options = EffectiveOptions(spec);
        for (let i = 0; i < options.length; i++) {
            const o = options[i];
            const row = await ctx.Provider.GetEntityObject<mjBizAppsVotingContestOptionEntity>(OPTIONS, ctx.ContextUser);
            row.NewRecord();
            row.ContestID = contest.ID;
            row.Label = o.Label;
            row.Description = o.Description ?? null;
            row.CandidatePersonID = o.CandidatePersonID ?? null;
            row.Sequence = i + 1;
            row.IsWriteIn = o.IsWriteIn ?? false;
            row.Status = 'Active';
            await this.saveOrAbort(row, 'option');
        }
    }

    private async rollbackQuietly(scope: { Rollback(): Promise<void> }): Promise<void> {
        try {
            await scope.Rollback();
        } catch {
            LogError('ElectionAdministrationEngine: rollback failed.');
        }
    }
}
