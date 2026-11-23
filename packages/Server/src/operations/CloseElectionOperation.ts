/**
 * @fileoverview `Voting.CloseElection` — close an election to voting.
 *
 * Transitions from Open to Closed.
 */

import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    VotingCloseElectionOperation as VotingCloseElectionOperationBase,
    type VotingCloseElectionInput,
    type VotingCloseElectionOutput,
} from '@mj-biz-apps/voting-entities';
import { type VotingContext, IsFailure } from '../shared/index.js';
import { FailOperation } from './operation-support.js';
import { VotingAuthorization } from '../shared/authorization.js';
import { ElectionAdministrationEngine } from '../engines/index.js';

@RegisterClass(BaseRemotableOperation, 'Voting.CloseElection')
export class CloseElectionOperation extends VotingCloseElectionOperationBase {
    protected async InternalExecute(
        input: VotingCloseElectionInput,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<VotingCloseElectionOutput> {
        if (!input?.ElectionID) {
            return { Success: false, Message: 'ElectionID is required.' };
        }

        const ctx: VotingContext = { ContextUser: user, Provider: provider };

        try {
            const result = await ElectionAdministrationEngine.Instance.CloseElection(input.ElectionID, ctx);

            if (IsFailure(result)) {
                return { Success: false, Message: result.ErrorMessage };
            }

            return {
                Success: true,
                Status: result.Value.Status,
            };
        } catch (e) {
            return FailOperation('Voting.CloseElection', e);
        }
    }

    protected async Authorize(input: VotingCloseElectionInput, user: UserInfo): Promise<boolean> {
        return VotingAuthorization.IsAdministrator(user);
    }
}

export function LoadCloseElectionOperation(): void {
    // tree-shaking anchor
}
