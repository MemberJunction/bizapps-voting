/**
 * @fileoverview `Voting.SubmitKeyShare` — submit a trustee's share of the election key.
 *
 * Once k shares are received, trustees can reconstruct the key to decrypt ballots.
 * Trustee operation: requires non-guest principal, engine validates election trustee status.
 */

import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    VotingSubmitKeyShareOperation as VotingSubmitKeyShareOperationBase,
    type VotingSubmitKeyShareInput,
    type VotingSubmitKeyShareOutput,
} from '@mj-biz-apps/voting-entities';
import { type VotingContext, IsFailure } from '../shared/index.js';
import { FailOperation } from './operation-support.js';
import { IsGuestPrincipal } from '../shared/principal.js';
import { TrusteeEngine } from '../engines/index.js';

@RegisterClass(BaseRemotableOperation, 'Voting.SubmitKeyShare')
export class SubmitKeyShareOperation extends VotingSubmitKeyShareOperationBase {
    protected async InternalExecute(
        input: VotingSubmitKeyShareInput,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<VotingSubmitKeyShareOutput> {
        if (!input?.ElectionID || input.ShareIndex === undefined || !input?.Share) {
            return { Success: false, Message: 'ElectionID, ShareIndex, and Share are required.' };
        }

        const ctx: VotingContext = { ContextUser: user, Provider: provider };

        try {
            const result = await TrusteeEngine.Instance.SubmitKeyShare(input, ctx);

            if (IsFailure(result)) {
                return { Success: false, Message: result.ErrorMessage };
            }

            return {
                Success: true,
                Accepted: result.Value.Accepted,
                SharesReceived: result.Value.SharesReceived,
                SharesRequired: result.Value.SharesRequired,
            };
        } catch (e) {
            return FailOperation('Voting.SubmitKeyShare', e, { NameOnly: true });
        }
    }

    protected async Authorize(input: VotingSubmitKeyShareInput, user: UserInfo): Promise<boolean> {
        // Trustee operations require non-guest principals
        if (IsGuestPrincipal(user)) {
            return false;
        }
        return true;
    }
}

export function LoadSubmitKeyShareOperation(): void {
    // tree-shaking anchor
}
