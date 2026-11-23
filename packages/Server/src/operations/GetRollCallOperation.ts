/**
 * @fileoverview `Voting.GetRollCall` — retrieve named per-voter selections for an Open election.
 *
 * Refused unconditionally for Confidential and Secret elections. Authorizes Voting Administrator
 * and Election Inspector; host apps with their own authorization call ResultsEngine.Instance.GetRollCall
 * directly.
 */

import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    VotingGetRollCallOperation as VotingGetRollCallOperationBase,
    type VotingGetRollCallInput,
    type VotingGetRollCallOutput,
} from '@mj-biz-apps/voting-entities';
import { type VotingContext, IsFailure } from '../shared/index.js';
import { FailOperation } from './operation-support.js';
import { VotingAuthorization } from '../shared/authorization.js';
import { ResultsEngine } from '../engines/index.js';

@RegisterClass(BaseRemotableOperation, 'Voting.GetRollCall')
export class GetRollCallOperation extends VotingGetRollCallOperationBase {
    protected async InternalExecute(
        input: VotingGetRollCallInput,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<VotingGetRollCallOutput> {
        if (!input?.ElectionID) {
            return { Success: false, Message: 'ElectionID is required.' };
        }

        const ctx: VotingContext = { ContextUser: user, Provider: provider };

        try {
            const result = await ResultsEngine.Instance.GetRollCall(input.ElectionID, ctx);

            if (IsFailure(result)) {
                return { Success: false, Message: result.ErrorMessage };
            }

            return {
                Success: true,
                ElectionID: result.Value.ElectionID,
                Status: result.Value.Status,
                Contests: result.Value.Contests,
            };
        } catch (e) {
            return FailOperation('Voting.GetRollCall', e, { NameOnly: true });
        }
    }

    protected async Authorize(input: VotingGetRollCallInput, user: UserInfo): Promise<boolean> {
        return VotingAuthorization.IsAdministrator(user) || VotingAuthorization.IsInspector(user);
    }
}

export function LoadGetRollCallOperation(): void {
    // tree-shaking anchor
}
