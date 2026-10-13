/**
 * @fileoverview `Voting.DecideNomination` — approve or reject a submitted nomination.
 *
 * If approved, creates a new candidate option.
 */

import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    VotingDecideNominationOperation as VotingDecideNominationOperationBase,
    type VotingDecideNominationInput,
    type VotingDecideNominationOutput,
} from '@mj-biz-apps/voting-entities';
import { type VotingContext, IsFailure } from '../shared/index.js';
import { FailOperation } from './operation-support.js';
import { VotingAuthorization } from '../shared/authorization.js';
import { NominationEngine } from '../engines/index.js';

@RegisterClass(BaseRemotableOperation, 'Voting.DecideNomination')
export class DecideNominationOperation extends VotingDecideNominationOperationBase {
    protected async InternalExecute(
        input: VotingDecideNominationInput,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<VotingDecideNominationOutput> {
        if (!input?.NominationID || !input?.Decision) {
            return { Success: false, Message: 'NominationID and Decision are required.' };
        }

        const ctx: VotingContext = { ContextUser: user, Provider: provider };

        try {
            const result = await NominationEngine.Instance.DecideNomination(input, ctx);

            if (IsFailure(result)) {
                return { Success: false, Message: result.ErrorMessage };
            }

            return {
                Success: true,
                Status: result.Value.Status,
                ContestOptionID: result.Value.ContestOptionID,
            };
        } catch (e) {
            return FailOperation('Voting.DecideNomination', e);
        }
    }

    protected async Authorize(input: VotingDecideNominationInput, user: UserInfo): Promise<boolean> {
        return VotingAuthorization.IsAdministrator(user);
    }
}

export function LoadDecideNominationOperation(): void {
    // tree-shaking anchor
}
