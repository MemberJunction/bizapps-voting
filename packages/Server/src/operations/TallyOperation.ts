/**
 * @fileoverview `Voting.Tally` — execute the tally for all contests.
 *
 * Applies the chosen tally method, resolves ties, and produces outcomes.
 */

import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    VotingTallyOperation as VotingTallyOperationBase,
    type VotingTallyInput,
    type VotingTallyOutput,
} from '@mj-biz-apps/voting-entities';
import { type VotingContext, IsFailure } from '../shared/index.js';
import { FailOperation } from './operation-support.js';
import { VotingAuthorization } from '../shared/authorization.js';
import { TallyEngine } from '../engines/index.js';

@RegisterClass(BaseRemotableOperation, 'Voting.Tally')
export class TallyOperation extends VotingTallyOperationBase {
    protected async InternalExecute(
        input: VotingTallyInput,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<VotingTallyOutput> {
        if (!input?.ElectionID) {
            return { Success: false, Message: 'ElectionID is required.' };
        }

        const ctx: VotingContext = { ContextUser: user, Provider: provider };

        try {
            const result = await TallyEngine.Instance.Tally(input.ElectionID, input.TieBreakSeed, ctx);

            if (IsFailure(result)) {
                return { Success: false, Message: result.ErrorMessage };
            }

            return {
                Success: true,
                Status: result.Value.Status,
                Contests: result.Value.Contests,
            };
        } catch (e) {
            return FailOperation('Voting.Tally', e);
        }
    }

    protected async Authorize(input: VotingTallyInput, user: UserInfo): Promise<boolean> {
        return VotingAuthorization.IsAdministrator(user);
    }
}

export function LoadTallyOperation(): void {
    // tree-shaking anchor
}
