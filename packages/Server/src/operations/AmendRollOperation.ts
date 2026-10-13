/**
 * @fileoverview `Voting.AmendRoll` — add or remove voters from the frozen roll.
 *
 * Records changes in EligibleVoter with reason trails.
 */

import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    VotingAmendRollOperation as VotingAmendRollOperationBase,
    type VotingAmendRollInput,
    type VotingAmendRollOutput,
} from '@mj-biz-apps/voting-entities';
import { type VotingContext, IsFailure } from '../shared/index.js';
import { FailOperation } from './operation-support.js';
import { VotingAuthorization } from '../shared/authorization.js';
import { VoterRollEngine } from '../engines/index.js';

@RegisterClass(BaseRemotableOperation, 'Voting.AmendRoll')
export class AmendRollOperation extends VotingAmendRollOperationBase {
    protected async InternalExecute(
        input: VotingAmendRollInput,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<VotingAmendRollOutput> {
        if (!input?.ElectionID) {
            return { Success: false, Message: 'ElectionID is required.' };
        }

        const ctx: VotingContext = { ContextUser: user, Provider: provider };

        try {
            const result = await VoterRollEngine.Instance.AmendRoll(input, ctx);

            if (IsFailure(result)) {
                return { Success: false, Message: result.ErrorMessage };
            }

            return {
                Success: true,
                Added: result.Value.Added,
                Removed: result.Value.Removed,
            };
        } catch (e) {
            return FailOperation('Voting.AmendRoll', e);
        }
    }

    protected async Authorize(input: VotingAmendRollInput, user: UserInfo): Promise<boolean> {
        return VotingAuthorization.IsAdministrator(user);
    }
}

export function LoadAmendRollOperation(): void {
    // tree-shaking anchor
}
