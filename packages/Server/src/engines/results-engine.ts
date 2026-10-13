/**
 * ResultsEngine: what a viewer may see of an election's results, snapshot publication, and turnout (design section 4.5).
 *
 * - GetResults applies ResultsVisible (contracts) exactly. FINAL results come from the IsFinal ContestResult rows once the
 *   election is Tallied or Certified. RUNNING results come ONLY from the latest ResultSnapshot: a request never computes
 *   anything from the live tallies, so there is no way to watch totals move per ballot.
 * - PublishSnapshot (called by the scheduled job) turns ContestRunningTally into a ResultSnapshot by the batch policy
 *   (LiveRefreshEveryBallots / LiveRefreshMinMinutes), the ResultsMinCast threshold and weight-class suppression. Tier
 *   Standard only: under tiers B and C ballots cannot be read before the ceremony.
 * - GetTurnout reads the poll book (Participation) only. It never touches the ballot box or the results.
 */

import { BaseSingleton } from '@memberjunction/global';
import { VotingEngineBase } from '@mj-biz-apps/voting-engine-base';
import {
    type VotingContestOutcome,
    type VotingGetResultsOutput,
    type VotingTallyOptionResult,
    type VotingTallyRound,
    type mjBizAppsVotingElectionEntity,
    type mjBizAppsVotingResultSnapshotEntity,
    ResultsVisible,
} from '@mj-biz-apps/voting-entities';
import { ElectionAudit } from '../shared/audit.js';
import { LoadElectionGraph, OptionsOf, TallyCodeOf } from '../shared/election-graph.js';
import { SystemContext } from '../shared/system-user.js';
import { type EngineResult, type VotingContext, Fail, IsFailure, Ok, PassFailure, RunViewOf } from '../shared/types.js';
import { SqlLiteral } from '../shared/voter-identity.js';
import { ErrorText, LoadElectionEntity, SaveOrThrow } from './person-support.js';
import { IsRankedMethod } from './ballot-style-builder.js';
import {
    type ClassCount,
    type RunningTallyRow,
    type SnapshotContestPlan,
    type TurnoutSummary,
    BuildSnapshotPayload,
    ComputeTurnout,
    CountByWeightClass,
    EvaluateClassSuppression,
    ParseSnapshotPayload,
    ShouldPublishSnapshot,
    SnapshotToContestOutcomes,
} from './results-policy.js';

const PARTICIPATIONS_ENTITY = 'MJ_BizApps_Voting: Participations';
const ELIGIBLE_VOTERS_ENTITY = 'MJ_BizApps_Voting: Eligible Voters';
const SNAPSHOTS_ENTITY = 'MJ_BizApps_Voting: Result Snapshots';
const RUNNING_TALLIES_ENTITY = 'MJ_BizApps_Voting: Contest Running Tallies';
const CAST_BALLOTS_ENTITY = 'MJ_BizApps_Voting: Cast Ballots';
const CONTESTS_ENTITY = 'MJ_BizApps_Voting: Contests';
const CONTEST_RESULTS_ENTITY = 'MJ_BizApps_Voting: Contest Results';
const CONTEST_OPTION_RESULTS_ENTITY = 'MJ_BizApps_Voting: Contest Option Results';

/** Who is asking, as far as the visibility rule cares. The operation fills this from the session and the roll. */
export interface ResultsViewer {
    IsAdministrator: boolean;
    IsEligible: boolean;
    HasVoted: boolean;
    IsHostMember: boolean;
    EligibleVoterID?: string;
}

export interface PublishSnapshotValue {
    Published: boolean;
    Reason: string;
    SnapshotID?: string;
    BallotCount?: number;
}

interface SnapshotRow {
    SnapshotAt: Date;
    BallotCount: number;
    Results: string;
}

interface ContestResultRow {
    ID: string;
    ContestID: string;
    Outcome: 'Decided' | 'Failed' | 'NoQuorum' | 'Passed' | 'Tied' | 'Void';
    Abstentions: number;
    VotesCast: number;
    Rounds: string | null;
    TieBreakNotes: string | null;
}

interface OptionResultRowData {
    ContestResultID: string;
    ContestOptionID: string;
    Votes: number;
    Position: number | null;
    Outcome: VotingTallyOptionResult['Outcome'];
}

function hidden(reason: string, running = false): VotingGetResultsOutput {
    return { Success: true, Visible: false, Reason: reason, IsFinal: false, IsRunning: running };
}

export class ResultsEngine extends BaseSingleton<ResultsEngine> {
    protected constructor() {
        super();
    }

    public static get Instance(): ResultsEngine {
        return super.getInstance<ResultsEngine>();
    }

    // --- GetResults ----------------------------------------------------------------------------------------------

    public async GetResults(electionID: string, viewer: ResultsViewer, ctx: VotingContext): Promise<EngineResult<VotingGetResultsOutput>> {
        const election = await LoadElectionEntity(electionID, ctx);
        if (!election) return Fail('ElectionNotFound', 'The election was not found.');
        const ballotCount = await this.countParticipations(election.ID, ctx);

        const visibility = ResultsVisible({
            Timing: election.ResultsTiming,
            Audience: election.ResultsAudience,
            Status: election.Status,
            ViewerIsAdministrator: viewer.IsAdministrator,
            ViewerHasVoted: viewer.HasVoted,
            ViewerIsEligible: viewer.IsEligible,
            ViewerIsHostMember: viewer.IsHostMember,
            BallotCount: ballotCount,
            MinCast: election.ResultsMinCast,
            SecrecyMode: election.SecrecyMode,
        });
        if (!visibility.Visible) return Ok(hidden(visibility.Reason, visibility.RunningResults));

        if (election.Status === 'Tallied' || election.Status === 'Certified') {
            return this.finalResults(election, ballotCount, visibility.Reason, ctx);
        }
        if (election.Status === 'Open') {
            return this.runningResults(election, viewer, ctx);
        }
        return Ok(hidden('No results are available for this election.'));
    }

    private async finalResults(
        election: mjBizAppsVotingElectionEntity,
        ballotCount: number,
        reason: string,
        ctx: VotingContext
    ): Promise<EngineResult<VotingGetResultsOutput>> {
        const rv = RunViewOf(ctx);
        const contestsRes = await rv.RunView<{ ID: string }>(
            { EntityName: CONTESTS_ENTITY, ExtraFilter: `ElectionID = ${SqlLiteral(election.ID)}`, Fields: ['ID'], OrderBy: 'Sequence', ResultType: 'simple' },
            ctx.ContextUser
        );
        if (!contestsRes.Success) return Fail('LoadFailed', 'The contests could not be loaded.');
        const contestIDs = contestsRes.Results.map((c) => c.ID);
        if (contestIDs.length === 0) return Ok(hidden('This election has no contests.'));
        const inList = contestIDs.map(SqlLiteral).join(',');

        const resultsRes = await rv.RunView<ContestResultRow>(
            {
                EntityName: CONTEST_RESULTS_ENTITY,
                ExtraFilter: `IsFinal = 1 AND ContestID IN (${inList})`,
                Fields: ['ID', 'ContestID', 'Outcome', 'Abstentions', 'VotesCast', 'Rounds', 'TieBreakNotes'],
                ResultType: 'simple',
            },
            ctx.ContextUser
        );
        if (!resultsRes.Success) return Fail('LoadFailed', 'The results could not be loaded.');
        if (resultsRes.Results.length === 0) return Ok(hidden('The results have not been recorded yet.'));

        const resultIDs = resultsRes.Results.map((r) => SqlLiteral(r.ID)).join(',');
        const optionsRes = await rv.RunView<OptionResultRowData>(
            {
                EntityName: CONTEST_OPTION_RESULTS_ENTITY,
                ExtraFilter: `ContestResultID IN (${resultIDs})`,
                Fields: ['ContestResultID', 'ContestOptionID', 'Votes', 'Position', 'Outcome'],
                ResultType: 'simple',
            },
            ctx.ContextUser
        );
        if (!optionsRes.Success) return Fail('LoadFailed', 'The option results could not be loaded.');

        const contests: VotingContestOutcome[] = [];
        for (const contestID of contestIDs) {
            const result = resultsRes.Results.find((r) => r.ContestID.toLowerCase() === contestID.toLowerCase());
            if (!result) continue;
            const options = optionsRes.Results.filter((o) => o.ContestResultID.toLowerCase() === result.ID.toLowerCase())
                .map<VotingTallyOptionResult>((o, i) => ({
                    OptionID: o.ContestOptionID,
                    Votes: Number(o.Votes),
                    Position: o.Position ?? i + 1,
                    Outcome: o.Outcome,
                }))
                .sort((a, b) => a.Position - b.Position);
            contests.push(this.toContestOutcome(result, options, ballotCount));
        }
        return Ok({
            Success: true,
            Visible: true,
            Reason: reason,
            IsFinal: true,
            IsRunning: false,
            BallotCount: ballotCount,
            Contests: contests,
        });
    }

    private toContestOutcome(result: ContestResultRow, options: VotingTallyOptionResult[], ballotCount: number): VotingContestOutcome {
        const notes = result.TieBreakNotes ? result.TieBreakNotes.split('\n') : [];
        const outcome: VotingContestOutcome = {
            ContestID: result.ContestID,
            Outcome: result.Outcome,
            VotesCast: Number(result.VotesCast),
            Abstentions: Number(result.Abstentions),
            Options: options,
            Notes: result.Outcome === 'NoQuorum' ? ['Quorum was not met.', ...notes] : notes,
        };
        void ballotCount;
        const rounds = this.parseRounds(result.Rounds);
        if (rounds) outcome.Rounds = rounds;
        return outcome;
    }

    private parseRounds(json: string | null): VotingTallyRound[] | undefined {
        if (!json) return undefined;
        try {
            const parsed: unknown = JSON.parse(json);
            return Array.isArray(parsed) ? (parsed as VotingTallyRound[]) : undefined;
        } catch {
            return undefined;
        }
    }

    private async runningResults(election: mjBizAppsVotingElectionEntity, viewer: ResultsViewer, ctx: VotingContext): Promise<EngineResult<VotingGetResultsOutput>> {
        const snapshot = await this.latestSnapshot(election.ID, ctx);
        if (!snapshot) return Ok(hidden('No running results have been published yet.', true));
        const payload = ParseSnapshotPayload(snapshot.Results);
        if (!payload) return Ok(hidden('The published results could not be read.', true));
        if (snapshot.BallotCount < election.ResultsMinCast) {
            return Ok(hidden(`Results are not shown until at least ${election.ResultsMinCast} ballots are cast.`, true));
        }
        const suppression = EvaluateClassSuppression(payload.ClassCounts, election.WeightClassMinSize);
        if (!suppression.Allowed) {
            return Ok(hidden('Results are withheld to protect voters in small weight classes.', true));
        }
        if (election.ResultsTiming === 'AdministratorsOnly') {
            await ElectionAudit.Record(ctx, election.ID, 'RunningResultsViewed', { IsAdministrator: viewer.IsAdministrator });
        }
        return Ok({
            Success: true,
            Visible: true,
            Reason: 'Running results from the latest published snapshot.',
            IsFinal: false,
            IsRunning: true,
            SnapshotAt: new Date(snapshot.SnapshotAt).toISOString(),
            BallotCount: snapshot.BallotCount,
            Contests: SnapshotToContestOutcomes(payload),
        });
    }

    // --- PublishSnapshot ---------------------------------------------------------------------------------------------

    /**
     * Publishes a running-results snapshot if the batch policy says one is due. Policy skips are successes with
     * Published=false; only an invalid combination (running results under tier B or C) is a failure.
     */
    public async PublishSnapshot(electionID: string, ctx: VotingContext): Promise<EngineResult<PublishSnapshotValue>> {
        const loaded = await LoadElectionGraph(electionID, ctx);
        if (IsFailure(loaded)) return PassFailure(loaded);
        const graph = loaded.Value;
        const election = graph.Election;

        if (election.ResultsTiming === 'AfterClose') return Ok({ Published: false, Reason: 'This election shows no results while voting is open.' });
        if (election.AssuranceTier !== 'Standard') {
            return Fail('TierNotSupported', 'Running results are available only for Standard assurance elections.');
        }
        if (election.Status !== 'Open') return Ok({ Published: false, Reason: 'Snapshots are published only while voting is open.' });

        const ballotCount = await this.countParticipations(election.ID, ctx);
        const last = await this.latestSnapshot(election.ID, ctx);
        const decision = ShouldPublishSnapshot({
            BallotCount: ballotCount,
            MinCast: election.ResultsMinCast,
            Last: last ? { BallotCount: last.BallotCount, SnapshotAt: new Date(last.SnapshotAt) } : null,
            EveryBallots: election.LiveRefreshEveryBallots,
            MinMinutes: election.LiveRefreshMinMinutes,
            Now: new Date(),
        });
        if (!decision.Publish) return Ok({ Published: false, Reason: decision.Reason });

        const sys = SystemContext(ctx);
        const classCounts = await this.loadClassCounts(election.ID, sys);
        if (IsFailure(classCounts)) return PassFailure(classCounts);
        const suppression = EvaluateClassSuppression(classCounts.Value, election.WeightClassMinSize);
        if (!suppression.Allowed) {
            return Ok({ Published: false, Reason: `Withheld: weight classes ${suppression.SuppressedClasses.join(', ')} are below the minimum size of ${election.WeightClassMinSize}.` });
        }

        const plans: SnapshotContestPlan[] = graph.Contests.map((c) => ({
            ContestID: c.ID,
            IsRanked: IsRankedMethod(TallyCodeOf(graph, c.ID)),
            OptionIDs: OptionsOf(graph, c.ID).filter((o) => o.Status === 'Active').map((o) => o.ID),
        }));
        const tallies = await this.loadRunningTallies(plans.map((p) => p.ContestID), sys);
        if (IsFailure(tallies)) return PassFailure(tallies);

        try {
            const snapshot = await sys.Provider.GetEntityObject<mjBizAppsVotingResultSnapshotEntity>(SNAPSHOTS_ENTITY, sys.ContextUser);
            snapshot.NewRecord();
            snapshot.ElectionID = election.ID;
            snapshot.SnapshotAt = new Date();
            snapshot.BallotCount = ballotCount;
            snapshot.Results = JSON.stringify(BuildSnapshotPayload(plans, tallies.Value, classCounts.Value));
            await SaveOrThrow(snapshot, 'The results snapshot');
            await ElectionAudit.Record(ctx, election.ID, 'SnapshotPublished', { BallotCount: ballotCount });
            return Ok({ Published: true, Reason: decision.Reason, SnapshotID: snapshot.ID, BallotCount: ballotCount });
        } catch (e) {
            return Fail('SnapshotFailed', ErrorText(e));
        }
    }

    private async loadClassCounts(electionID: string, sys: VotingContext): Promise<EngineResult<ClassCount[]>> {
        const res = await RunViewOf(sys).RunView<{ WeightClass: string | null }>(
            {
                EntityName: CAST_BALLOTS_ENTITY,
                ExtraFilter: `ElectionID = ${SqlLiteral(electionID)} AND Status = 'Counted'`,
                Fields: ['WeightClass'],
                ResultType: 'simple',
            },
            sys.ContextUser
        );
        return res.Success ? Ok(CountByWeightClass(res.Results.map((r) => r.WeightClass))) : Fail('LoadFailed', 'The ballot counts could not be read.');
    }

    private async loadRunningTallies(contestIDs: string[], sys: VotingContext): Promise<EngineResult<RunningTallyRow[]>> {
        if (contestIDs.length === 0) return Ok([]);
        const res = await RunViewOf(sys).RunView<RunningTallyRow>(
            {
                EntityName: RUNNING_TALLIES_ENTITY,
                ExtraFilter: `ContestID IN (${contestIDs.map(SqlLiteral).join(',')})`,
                Fields: ['ContestID', 'ContestOptionID', 'VoteCount'],
                ResultType: 'simple',
            },
            sys.ContextUser
        );
        return res.Success ? Ok(res.Results) : Fail('LoadFailed', 'The running tallies could not be read.');
    }

    // --- GetTurnout --------------------------------------------------------------------------------------------------------

    /** Turnout from the poll book. Never reports how anyone voted. */
    public async GetTurnout(electionID: string, ctx: VotingContext): Promise<EngineResult<TurnoutSummary>> {
        const loaded = await LoadElectionGraph(electionID, ctx);
        if (IsFailure(loaded)) return PassFailure(loaded);
        const graph = loaded.Value;
        const rv = RunViewOf(ctx);

        const eligible = await rv.RunView(
            { EntityName: ELIGIBLE_VOTERS_ENTITY, ExtraFilter: `ElectionID = ${SqlLiteral(graph.Election.ID)} AND Status = 'Eligible'`, ResultType: 'count_only' },
            ctx.ContextUser
        );
        if (!eligible.Success) return Fail('LoadFailed', 'The voter roll could not be counted.');
        const participation = await rv.RunView<{ Channel: string; VoterCredentialMethodID: string | null }>(
            {
                EntityName: PARTICIPATIONS_ENTITY,
                ExtraFilter: `ElectionID = ${SqlLiteral(graph.Election.ID)}`,
                Fields: ['Channel', 'VoterCredentialMethodID'],
                ResultType: 'simple',
            },
            ctx.ContextUser
        );
        if (!participation.Success) return Fail('LoadFailed', 'The poll book could not be read.');

        return Ok(
            ComputeTurnout(
                eligible.TotalRowCount,
                participation.Results,
                (id) => VotingEngineBase.Instance.GetVoterCredentialMethodByID(id)?.Code ?? null,
                graph.Configuration.Quorum
            )
        );
    }

    // --- Shared reads ----------------------------------------------------------------------------------------------------------

    private async countParticipations(electionID: string, ctx: VotingContext): Promise<number> {
        const res = await RunViewOf(ctx).RunView(
            { EntityName: PARTICIPATIONS_ENTITY, ExtraFilter: `ElectionID = ${SqlLiteral(electionID)}`, ResultType: 'count_only' },
            ctx.ContextUser
        );
        return res.Success ? res.TotalRowCount : 0;
    }

    private async latestSnapshot(electionID: string, ctx: VotingContext): Promise<SnapshotRow | null> {
        const res = await RunViewOf(ctx).RunView<SnapshotRow>(
            {
                EntityName: SNAPSHOTS_ENTITY,
                ExtraFilter: `ElectionID = ${SqlLiteral(electionID)}`,
                Fields: ['SnapshotAt', 'BallotCount', 'Results'],
                OrderBy: 'SnapshotAt DESC',
                MaxRows: 1,
                ResultType: 'simple',
            },
            ctx.ContextUser
        );
        return res.Success && res.Results[0] ? res.Results[0] : null;
    }
}
