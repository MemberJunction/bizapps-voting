/**
 * CommentEngine: resolution of standards-ballot comments (design section 5, BallotComment / CommentResolution).
 *
 * Comments themselves are written by CastEngine (StandardsItem contests in Open mode, linked to the Participation). Here an
 * administrator resolves a comment (one CommentResolution per comment; resolving again updates it and clears the
 * commenter's earlier response, since the commenter must answer the new disposition), and the commenter may later record
 * whether they are Satisfied or Unsatisfied.
 */

import {
    type VotingResolveCommentInput,
    type mjBizAppsVotingBallotCommentEntity,
    type mjBizAppsVotingCommentResolutionEntity,
    type mjBizAppsVotingContestEntity,
    type mjBizAppsVotingParticipationEntity,
} from '@mj-biz-apps/voting-entities';
import { BaseSingleton, UUIDsEqual } from '@memberjunction/global';
import { ElectionAudit } from '../shared/audit.js';
import { type VoterIdentity, SqlLiteral } from '../shared/voter-identity.js';
import { type EngineResult, type VotingContext, Fail, Ok, RunViewOf } from '../shared/types.js';
import { ErrorText, SaveOrThrow } from './person-support.js';

const COMMENTS_ENTITY = 'MJ_BizApps_Voting: Ballot Comments';
const RESOLUTIONS_ENTITY = 'MJ_BizApps_Voting: Comment Resolutions';
const CONTESTS_ENTITY = 'MJ_BizApps_Voting: Contests';
const PARTICIPATIONS_ENTITY = 'MJ_BizApps_Voting: Participations';

type Disposition = mjBizAppsVotingCommentResolutionEntity['Disposition'];
type CommenterResponse = NonNullable<mjBizAppsVotingCommentResolutionEntity['CommenterResponse']>;

export const COMMENT_DISPOSITIONS: ReadonlyArray<Disposition> = ['Accepted', 'AcceptedInPrinciple', 'Rejected', 'Withdrawn', 'Deferred'];
export const COMMENTER_RESPONSES: ReadonlyArray<CommenterResponse> = ['Satisfied', 'Unsatisfied'];

/** The disposition matching the text (case-insensitive), or null. */
export function ParseDisposition(text: string): Disposition | null {
    const wanted = text.trim().toLowerCase();
    return COMMENT_DISPOSITIONS.find((d) => d.toLowerCase() === wanted) ?? null;
}

export interface ResolveCommentValue {
    CommentResolutionID: string;
}

export class CommentEngine extends BaseSingleton<CommentEngine> {
    protected constructor() {
        super();
    }

    public static get Instance(): CommentEngine {
        return super.getInstance<CommentEngine>();
    }

    public async ResolveComment(input: VotingResolveCommentInput, ctx: VotingContext): Promise<EngineResult<ResolveCommentValue>> {
        const disposition = ParseDisposition(input.Disposition);
        if (!disposition) return Fail('InvalidDisposition', `The disposition must be one of: ${COMMENT_DISPOSITIONS.join(', ')}.`);
        const comment = await ctx.Provider.GetEntityObject<mjBizAppsVotingBallotCommentEntity>(COMMENTS_ENTITY, ctx.ContextUser);
        if (!(await comment.Load(input.BallotCommentID))) return Fail('CommentNotFound', 'The comment was not found.');

        try {
            const resolution = (await this.loadResolution(comment.ID, ctx)) ?? (await this.newResolution(comment.ID, ctx));
            resolution.Disposition = disposition;
            resolution.Response = input.Response ?? null;
            resolution.ResolvedByUserID = ctx.ContextUser.ID ?? null;
            resolution.ResolvedAt = new Date();
            resolution.CommenterResponse = null;
            await SaveOrThrow(resolution, 'The comment resolution');
            const electionID = await this.electionOfContest(comment.ContestID, ctx);
            if (electionID) await ElectionAudit.Record(ctx, electionID, 'CommentResolved', { BallotCommentID: comment.ID, Disposition: disposition });
            return Ok({ CommentResolutionID: resolution.ID });
        } catch (e) {
            return Fail('ResolveFailed', ErrorText(e));
        }
    }

    /** The commenter's answer to a resolution. Only the voter whose participation carries the comment may answer (Open-mode comments). */
    public async RecordCommenterResponse(
        ballotCommentID: string,
        response: string,
        identity: VoterIdentity,
        ctx: VotingContext
    ): Promise<EngineResult<ResolveCommentValue>> {
        const answer = COMMENTER_RESPONSES.find((r) => r.toLowerCase() === response.trim().toLowerCase());
        if (!answer) return Fail('InvalidResponse', `The response must be one of: ${COMMENTER_RESPONSES.join(', ')}.`);
        const comment = await ctx.Provider.GetEntityObject<mjBizAppsVotingBallotCommentEntity>(COMMENTS_ENTITY, ctx.ContextUser);
        if (!(await comment.Load(ballotCommentID))) return Fail('CommentNotFound', 'The comment was not found.');
        const participation = await ctx.Provider.GetEntityObject<mjBizAppsVotingParticipationEntity>(PARTICIPATIONS_ENTITY, ctx.ContextUser);
        if (!(await participation.Load(comment.ParticipationID)) || !UUIDsEqual(participation.EligibleVoterID, identity.EligibleVoterID)) {
            return Fail('NotYourComment', 'That comment is not yours.');
        }
        const resolution = await this.loadResolution(comment.ID, ctx);
        if (!resolution) return Fail('NotResolved', 'The comment has not been resolved yet.');
        try {
            resolution.CommenterResponse = answer;
            await SaveOrThrow(resolution, 'The commenter response');
            return Ok({ CommentResolutionID: resolution.ID });
        } catch (e) {
            return Fail('ResponseFailed', ErrorText(e));
        }
    }

    private async loadResolution(commentID: string, ctx: VotingContext): Promise<mjBizAppsVotingCommentResolutionEntity | null> {
        const res = await RunViewOf(ctx).RunView<mjBizAppsVotingCommentResolutionEntity>(
            { EntityName: RESOLUTIONS_ENTITY, ExtraFilter: `BallotCommentID = ${SqlLiteral(commentID)}`, MaxRows: 1, ResultType: 'entity_object' },
            ctx.ContextUser
        );
        return res.Success && res.Results[0] ? res.Results[0] : null;
    }

    private async newResolution(commentID: string, ctx: VotingContext): Promise<mjBizAppsVotingCommentResolutionEntity> {
        const row = await ctx.Provider.GetEntityObject<mjBizAppsVotingCommentResolutionEntity>(RESOLUTIONS_ENTITY, ctx.ContextUser);
        row.NewRecord();
        row.BallotCommentID = commentID;
        return row;
    }

    private async electionOfContest(contestID: string, ctx: VotingContext): Promise<string | null> {
        const contest = await ctx.Provider.GetEntityObject<mjBizAppsVotingContestEntity>(CONTESTS_ENTITY, ctx.ContextUser);
        return (await contest.Load(contestID)) ? contest.ElectionID : null;
    }
}
