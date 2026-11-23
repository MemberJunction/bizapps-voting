/**
 * @fileoverview `Voting.CancelElection` — cancel an election at any point before certification.
 *
 * Records the reason and transitions all ballots to void.
 */

import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    VotingCancelElectionOperation as VotingCancelElectionOperationBase,
    type VotingCancelElectionInput,
    type VotingCancelElectionOutput,
} from '@mj-biz-apps/voting-entities';
import { type VotingContext, IsFailure } from '../shared/index.js';
import { FailOperation } from './operation-support.js';
import { VotingAuthorization } from '../shared/authorization.js';
import { ElectionAdministrationEngine } from '../engines/index.js';

@RegisterClass(BaseRemotableOperation, 'Voting.CancelElection')
export class CancelElectionOperation extends VotingCancelElectionOperationBase {
    protected async InternalExecute(
        input: VotingCancelElectionInput,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<VotingCancelElectionOutput> {
        if (!input?.ElectionID || !input?.Reason) {
            return { Success: false, Message: 'ElectionID and Reason are required.' };
        }

        const ctx: VotingContext = { ContextUser: user, Provider: provider };

        try {
            const result = await ElectionAdministrationEngine.Instance.CancelElection(input.ElectionID, input.Reason, ctx);

            if (IsFailure(result)) {
                return { Success: false, Message: result.ErrorMessage };
            }

            return {
                Success: true,
                Status: result.Value.Status,
            };
        } catch (e) {
            return FailOperation('Voting.CancelElection', e);
        }
    }

    protected async Authorize(input: VotingCancelElectionInput, user: UserInfo): Promise<boolean> {
        return VotingAuthorization.IsAdministrator(user);
    }
}

export function LoadCancelElectionOperation(): void {
    // tree-shaking anchor
}
