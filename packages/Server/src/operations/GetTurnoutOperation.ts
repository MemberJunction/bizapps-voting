/**
 * @fileoverview `Voting.GetTurnout` — retrieve turnout statistics.
 *
 * Returns voter count, votes cast, turnout percentage, quorum status.
 */

import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    VotingGetTurnoutOperation as VotingGetTurnoutOperationBase,
    type VotingGetTurnoutInput,
    type VotingGetTurnoutOutput,
} from '@mj-biz-apps/voting-entities';
import { type VotingContext, IsFailure } from '../shared/index.js';
import { FailOperation } from './operation-support.js';
import { VotingAuthorization } from '../shared/authorization.js';
import { ResultsEngine } from '../engines/index.js';

@RegisterClass(BaseRemotableOperation, 'Voting.GetTurnout')
export class GetTurnoutOperation extends VotingGetTurnoutOperationBase {
    protected async InternalExecute(
        input: VotingGetTurnoutInput,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<VotingGetTurnoutOutput> {
        if (!input?.ElectionID) {
            return { Success: false, Message: 'ElectionID is required.' };
        }

        const ctx: VotingContext = { ContextUser: user, Provider: provider };

        try {
            const result = await ResultsEngine.Instance.GetTurnout(input.ElectionID, ctx);

            if (IsFailure(result)) {
                return { Success: false, Message: result.ErrorMessage };
            }

            return {
                Success: true,
                Eligible: result.Value.Eligible,
                Voted: result.Value.Voted,
                TurnoutPercent: result.Value.TurnoutPercent,
                QuorumMet: result.Value.QuorumMet,
                ByChannel: result.Value.ByChannel,
                ByMethod: result.Value.ByMethod,
            };
        } catch (e) {
            return FailOperation('Voting.GetTurnout', e);
        }
    }

    protected async Authorize(input: VotingGetTurnoutInput, user: UserInfo): Promise<boolean> {
        return VotingAuthorization.IsAdministrator(user) || VotingAuthorization.IsInspector(user);
    }
}

export function LoadGetTurnoutOperation(): void {
    // tree-shaking anchor
}
