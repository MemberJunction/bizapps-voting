/**
 * @fileoverview `Voting.UpdateElection` — update an election's configuration.
 *
 * Updates timing, secrecy mode, results settings, etc.
 * Some changes are allowed only in certain statuses.
 */

import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    VotingUpdateElectionOperation as VotingUpdateElectionOperationBase,
    type VotingUpdateElectionInput,
    type VotingUpdateElectionOutput,
} from '@mj-biz-apps/voting-entities';
import { type VotingContext, IsFailure } from '../shared/index.js';
import { FailOperation } from './operation-support.js';
import { VotingAuthorization } from '../shared/authorization.js';
import { ElectionAdministrationEngine } from '../engines/index.js';

@RegisterClass(BaseRemotableOperation, 'Voting.UpdateElection')
export class UpdateElectionOperation extends VotingUpdateElectionOperationBase {
    protected async InternalExecute(
        input: VotingUpdateElectionInput,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<VotingUpdateElectionOutput> {
        if (!input?.ElectionID) {
            return { Success: false, Message: 'ElectionID is required.' };
        }

        const ctx: VotingContext = { ContextUser: user, Provider: provider };

        try {
            const result = await ElectionAdministrationEngine.Instance.UpdateElection(input, ctx);

            if (IsFailure(result)) {
                return { Success: false, Message: result.ErrorMessage };
            }

            return {
                Success: true,
                ElectionID: result.Value.ElectionID,
            };
        } catch (e) {
            return FailOperation('Voting.UpdateElection', e);
        }
    }

    protected async Authorize(input: VotingUpdateElectionInput, user: UserInfo): Promise<boolean> {
        return VotingAuthorization.IsAdministrator(user);
    }
}

export function LoadUpdateElectionOperation(): void {
    // tree-shaking anchor
}
