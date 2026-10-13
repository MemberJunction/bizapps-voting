/**
 * @fileoverview `Voting.FreezeRoll` — freeze the eligible voter roll at a record date.
 *
 * Snapshots eligible voters from the configured EligibilitySource.
 * Returns voter count and roll hash for verification.
 */

import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    VotingFreezeRollOperation as VotingFreezeRollOperationBase,
    type VotingFreezeRollInput,
    type VotingFreezeRollOutput,
} from '@mj-biz-apps/voting-entities';
import { type VotingContext, IsFailure, RefreshCachedViews } from '../shared/index.js';
import { FailOperation } from './operation-support.js';
import { VotingAuthorization } from '../shared/authorization.js';
import { VoterRollEngine } from '../engines/index.js';

@RegisterClass(BaseRemotableOperation, 'Voting.FreezeRoll')
export class FreezeRollOperation extends VotingFreezeRollOperationBase {
    protected async InternalExecute(
        input: VotingFreezeRollInput,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<VotingFreezeRollOutput> {
        if (!input?.ElectionID) {
            return { Success: false, Message: 'ElectionID is required.' };
        }

        const ctx: VotingContext = { ContextUser: user, Provider: provider };

        try {
            const result = await VoterRollEngine.Instance.FreezeRoll(input.ElectionID, ctx);

            if (IsFailure(result)) {
                return { Success: false, Message: result.ErrorMessage };
            }

            await RefreshCachedViews(['MJ_BizApps_Voting: Elections', 'MJ_BizApps_Voting: Eligible Voters']);

            return {
                Success: true,
                VoterCount: result.Value.VoterCount,
                RollHash: result.Value.RollHash,
            };
        } catch (e) {
            return FailOperation('Voting.FreezeRoll', e);
        }
    }

    protected async Authorize(input: VotingFreezeRollInput, user: UserInfo): Promise<boolean> {
        return VotingAuthorization.IsAdministrator(user);
    }
}

export function LoadFreezeRollOperation(): void {
    // tree-shaking anchor
}
