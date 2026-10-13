/**
 * @fileoverview `Voting.ChallengeVoter` — challenge a voter's eligibility.
 *
 * Records a challenge with optional immediate decision.
 */

import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    VotingChallengeVoterOperation as VotingChallengeVoterOperationBase,
    type VotingChallengeVoterInput,
    type VotingChallengeVoterOutput,
} from '@mj-biz-apps/voting-entities';
import { type VotingContext, IsFailure } from '../shared/index.js';
import { FailOperation } from './operation-support.js';
import { VotingAuthorization } from '../shared/authorization.js';
import { VoterRollEngine } from '../engines/index.js';

@RegisterClass(BaseRemotableOperation, 'Voting.ChallengeVoter')
export class ChallengeVoterOperation extends VotingChallengeVoterOperationBase {
    protected async InternalExecute(
        input: VotingChallengeVoterInput,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<VotingChallengeVoterOutput> {
        if (!input?.EligibleVoterID || !input?.Reason) {
            return { Success: false, Message: 'EligibleVoterID and Reason are required.' };
        }

        const ctx: VotingContext = { ContextUser: user, Provider: provider };

        try {
            const result = await VoterRollEngine.Instance.ChallengeVoter(input, ctx);

            if (IsFailure(result)) {
                return { Success: false, Message: result.ErrorMessage };
            }

            return {
                Success: true,
                Status: result.Value.Status,
            };
        } catch (e) {
            return FailOperation('Voting.ChallengeVoter', e);
        }
    }

    protected async Authorize(input: VotingChallengeVoterInput, user: UserInfo): Promise<boolean> {
        return VotingAuthorization.IsAdministrator(user);
    }
}

export function LoadChallengeVoterOperation(): void {
    // tree-shaking anchor
}
