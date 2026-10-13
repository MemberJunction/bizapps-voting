/**
 * @fileoverview `Voting.ResolveComment` — respond to a ballot comment.
 *
 * Records the disposition and optional response text.
 */

import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    VotingResolveCommentOperation as VotingResolveCommentOperationBase,
    type VotingResolveCommentInput,
    type VotingResolveCommentOutput,
} from '@mj-biz-apps/voting-entities';
import { type VotingContext, IsFailure } from '../shared/index.js';
import { FailOperation } from './operation-support.js';
import { VotingAuthorization } from '../shared/authorization.js';
import { CommentEngine } from '../engines/index.js';

@RegisterClass(BaseRemotableOperation, 'Voting.ResolveComment')
export class ResolveCommentOperation extends VotingResolveCommentOperationBase {
    protected async InternalExecute(
        input: VotingResolveCommentInput,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<VotingResolveCommentOutput> {
        if (!input?.BallotCommentID || !input?.Disposition) {
            return { Success: false, Message: 'BallotCommentID and Disposition are required.' };
        }

        const ctx: VotingContext = { ContextUser: user, Provider: provider };

        try {
            const result = await CommentEngine.Instance.ResolveComment(input, ctx);

            if (IsFailure(result)) {
                return { Success: false, Message: result.ErrorMessage };
            }

            return {
                Success: true,
                CommentResolutionID: result.Value.CommentResolutionID,
            };
        } catch (e) {
            return FailOperation('Voting.ResolveComment', e);
        }
    }

    protected async Authorize(input: VotingResolveCommentInput, user: UserInfo): Promise<boolean> {
        return VotingAuthorization.IsAdministrator(user);
    }
}

export function LoadResolveCommentOperation(): void {
    // tree-shaking anchor
}
