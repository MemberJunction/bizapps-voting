/**
 * @fileoverview `Voting.CreateElection` — create a new election.
 *
 * Creates an election with contests, options, and eligibility source in Draft status.
 * Requires administrator role.
 */

import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    VotingCreateElectionOperation as VotingCreateElectionOperationBase,
    type VotingCreateElectionInput,
    type VotingCreateElectionOutput,
} from '@mj-biz-apps/voting-entities';
import { type VotingContext, IsFailure } from '../shared/index.js';
import { FailOperation } from './operation-support.js';
import { VotingAuthorization } from '../shared/authorization.js';
import { ElectionAdministrationEngine } from '../engines/index.js';

@RegisterClass(BaseRemotableOperation, 'Voting.CreateElection')
export class CreateElectionOperation extends VotingCreateElectionOperationBase {
    protected async InternalExecute(
        input: VotingCreateElectionInput,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<VotingCreateElectionOutput> {
        if (!input?.ElectionTypeCode || !input?.Name || !input?.EligibilitySource || !input?.Contests?.length) {
            return {
                Success: false,
                Message: 'ElectionTypeCode, Name, EligibilitySource, and Contests are required.',
            };
        }

        const ctx: VotingContext = { ContextUser: user, Provider: provider };

        try {
            const result = await ElectionAdministrationEngine.Instance.CreateElection(input, ctx);

            if (IsFailure(result)) {
                return { Success: false, Message: result.ErrorMessage };
            }

            return {
                Success: true,
                ElectionID: result.Value.ElectionID,
            };
        } catch (e) {
            return FailOperation('Voting.CreateElection', e);
        }
    }

    protected async Authorize(input: VotingCreateElectionInput, user: UserInfo): Promise<boolean> {
        return VotingAuthorization.IsAdministrator(user);
    }
}

export function LoadCreateElectionOperation(): void {
    // tree-shaking anchor
}
