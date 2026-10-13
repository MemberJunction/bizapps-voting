/**
 * NominationEngine: nominations for office contests (design section 5, Nomination).
 *
 * SubmitNomination: the election must be in Nominations (and inside NominationsOpenAt..NominationsCloseAt when set). The
 * nominator is the voter's Person (from the roll entry), or the acting user's Person when an administrator nominates.
 * DecideNomination: Approved creates the ContestOption (label = the nominee's display name) and links it; Rejected just
 * records the decision. Both happen in one transaction.
 */

import { BaseSingleton } from '@memberjunction/global';
import {
    type VotingDecideNominationInput,
    type VotingSubmitNominationInput,
    type mjBizAppsVotingContestEntity,
    type mjBizAppsVotingContestOptionEntity,
    type mjBizAppsVotingEligibleVoterEntity,
    type mjBizAppsVotingNominationEntity,
} from '@mj-biz-apps/voting-entities';
import { ElectionAudit } from '../shared/audit.js';
import { type VoterIdentity, SqlLiteral } from '../shared/voter-identity.js';
import { type EngineResult, type VotingContext, Fail, Ok, RunViewOf } from '../shared/types.js';
import { ErrorText, FindPersonForUser, GetPerson, LoadElectionEntity, SaveOrThrow, RunTransactional } from './person-support.js';

const NOMINATIONS_ENTITY = 'MJ_BizApps_Voting: Nominations';
const CONTESTS_ENTITY = 'MJ_BizApps_Voting: Contests';
const OPTIONS_ENTITY = 'MJ_BizApps_Voting: Contest Options';
const VOTERS_ENTITY = 'MJ_BizApps_Voting: Eligible Voters';

export interface SubmitNominationValue {
    NominationID: string;
}

export interface DecideNominationValue {
    Status: string;
    ContestOptionID?: string;
}

export class NominationEngine extends BaseSingleton<NominationEngine> {
    protected constructor() {
        super();
    }

    public static get Instance(): NominationEngine {
        return super.getInstance<NominationEngine>();
    }

    /** @param identity The resolved voter, or null when an administrator nominates on someone's behalf. */
    public async SubmitNomination(
        input: VotingSubmitNominationInput,
        identity: VoterIdentity | null,
        ctx: VotingContext
    ): Promise<EngineResult<SubmitNominationValue>> {
        const contest = await this.loadContest(input.ContestID, ctx);
        if (!contest) return Fail('ContestNotFound', 'The contest was not found.');
        const election = await LoadElectionEntity(contest.ElectionID, ctx);
        if (!election) return Fail('ElectionNotFound', 'The election was not found.');
        if (election.Status !== 'Nominations') return Fail('NominationsClosed', 'This election is not accepting nominations.');
        const now = Date.now();
        if (election.NominationsOpenAt && new Date(election.NominationsOpenAt).getTime() > now) return Fail('NominationsNotOpen', 'Nominations have not opened yet.');
        if (election.NominationsCloseAt && new Date(election.NominationsCloseAt).getTime() < now) return Fail('NominationsClosed', 'Nominations have closed.');

        if (!(await GetPerson(input.NomineePersonID, ctx))) return Fail('NomineeNotFound', 'The nominee is not a known person.');
        const nominatorID = await this.nominatorPersonID(identity, ctx);
        if (identity && !nominatorID) return Fail('NominatorNotFound', 'The nominating voter could not be matched to a person.');

        const dup = await RunViewOf(ctx).RunView<{ ID: string }>(
            {
                EntityName: NOMINATIONS_ENTITY,
                ExtraFilter: `ContestID = ${SqlLiteral(contest.ID)} AND NomineePersonID = ${SqlLiteral(input.NomineePersonID)}`,
                Fields: ['ID'],
                MaxRows: 1,
                ResultType: 'simple',
            },
            ctx.ContextUser
        );
        if (dup.Success && dup.Results.length > 0) return Fail('AlreadyNominated', 'That person has already been nominated for this contest.');

        try {
            const nomination = await ctx.Provider.GetEntityObject<mjBizAppsVotingNominationEntity>(NOMINATIONS_ENTITY, ctx.ContextUser);
            nomination.NewRecord();
            nomination.ContestID = contest.ID;
            nomination.NomineePersonID = input.NomineePersonID;
            nomination.NominatedByPersonID = nominatorID;
            nomination.Status = 'Submitted';
            nomination.Statement = input.Statement ?? null;
            nomination.SubmittedAt = new Date();
            await SaveOrThrow(nomination, 'The nomination');
            await ElectionAudit.Record(ctx, election.ID, 'NominationSubmitted', { ContestID: contest.ID, NominationID: nomination.ID });
            return Ok({ NominationID: nomination.ID });
        } catch (e) {
            return Fail('NominationFailed', ErrorText(e));
        }
    }

    public async DecideNomination(input: VotingDecideNominationInput, ctx: VotingContext): Promise<EngineResult<DecideNominationValue>> {
        const nomination = await ctx.Provider.GetEntityObject<mjBizAppsVotingNominationEntity>(NOMINATIONS_ENTITY, ctx.ContextUser);
        if (!(await nomination.Load(input.NominationID))) return Fail('NominationNotFound', 'The nomination was not found.');
        if (nomination.Status !== 'Submitted' && nomination.Status !== 'Accepted') {
            return Fail('AlreadyDecided', `The nomination is ${nomination.Status} and can no longer be decided.`);
        }
        const contest = await this.loadContest(nomination.ContestID, ctx);
        if (!contest) return Fail('ContestNotFound', 'The contest was not found.');
        const election = await LoadElectionEntity(contest.ElectionID, ctx);
        if (!election) return Fail('ElectionNotFound', 'The election was not found.');
        if (election.Status !== 'Nominations' && election.Status !== 'Draft' && election.Status !== 'Ready') {
            return Fail('ConfigurationLocked', 'Nominations can be decided only before voting opens.');
        }
        const nominee = await GetPerson(nomination.NomineePersonID, ctx);
        if (!nominee) return Fail('NomineeNotFound', 'The nominee is not a known person.');

        try {
            const value = await RunTransactional(ctx, async (): Promise<DecideNominationValue> => {
                let optionID: string | undefined;
                if (input.Decision === 'Approved') {
                    const option = await ctx.Provider.GetEntityObject<mjBizAppsVotingContestOptionEntity>(OPTIONS_ENTITY, ctx.ContextUser);
                    option.NewRecord();
                    option.ContestID = contest.ID;
                    option.Label = nominee.DisplayName;
                    option.CandidatePersonID = nominee.ID;
                    option.Sequence = (await this.maxOptionSequence(contest.ID, ctx)) + 1;
                    option.IsWriteIn = false;
                    option.Status = 'Active';
                    await SaveOrThrow(option, 'The candidate option');
                    optionID = option.ID;
                    nomination.ContestOptionID = option.ID;
                }
                nomination.Status = input.Decision === 'Approved' ? 'Approved' : 'Rejected';
                nomination.DecidedAt = new Date();
                nomination.DecisionNotes = input.Notes ?? null;
                await SaveOrThrow(nomination, 'The nomination decision');
                return { Status: nomination.Status, ContestOptionID: optionID };
            });
            await ElectionAudit.Record(ctx, election.ID, 'NominationDecided', { NominationID: nomination.ID, Decision: input.Decision });
            return Ok(value);
        } catch (e) {
            return Fail('DecisionFailed', ErrorText(e));
        }
    }

    private async loadContest(contestID: string, ctx: VotingContext): Promise<mjBizAppsVotingContestEntity | null> {
        const contest = await ctx.Provider.GetEntityObject<mjBizAppsVotingContestEntity>(CONTESTS_ENTITY, ctx.ContextUser);
        return (await contest.Load(contestID)) ? contest : null;
    }

    private async nominatorPersonID(identity: VoterIdentity | null, ctx: VotingContext): Promise<string | null> {
        if (identity) {
            const voter = await ctx.Provider.GetEntityObject<mjBizAppsVotingEligibleVoterEntity>(VOTERS_ENTITY, ctx.ContextUser);
            return (await voter.Load(identity.EligibleVoterID)) ? voter.PersonID : null;
        }
        return (await FindPersonForUser(ctx))?.ID ?? null;
    }

    private async maxOptionSequence(contestID: string, ctx: VotingContext): Promise<number> {
        const res = await RunViewOf(ctx).RunView<{ Sequence: number }>(
            { EntityName: OPTIONS_ENTITY, ExtraFilter: `ContestID = ${SqlLiteral(contestID)}`, Fields: ['Sequence'], OrderBy: 'Sequence DESC', MaxRows: 1, ResultType: 'simple' },
            ctx.ContextUser
        );
        return res.Success && res.Results[0] ? Number(res.Results[0].Sequence) : 0;
    }
}
