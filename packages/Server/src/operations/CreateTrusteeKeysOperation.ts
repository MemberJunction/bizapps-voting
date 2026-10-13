/**
 * @fileoverview `Voting.CreateTrusteeKeys` — generate election keys and split among trustees.
 *
 * Generates an RSA-3072 keypair and splits the private key using Shamir's secret sharing.
 * Used for high-assurance elections only.
 */

import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    VotingCreateTrusteeKeysOperation as VotingCreateTrusteeKeysOperationBase,
    type VotingCreateTrusteeKeysInput,
    type VotingCreateTrusteeKeysOutput,
} from '@mj-biz-apps/voting-entities';
import { type VotingContext, IsFailure } from '../shared/index.js';
import { FailOperation } from './operation-support.js';
import { VotingAuthorization } from '../shared/authorization.js';
import { TrusteeEngine } from '../engines/index.js';

@RegisterClass(BaseRemotableOperation, 'Voting.CreateTrusteeKeys')
export class CreateTrusteeKeysOperation extends VotingCreateTrusteeKeysOperationBase {
    protected async InternalExecute(
        input: VotingCreateTrusteeKeysInput,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<VotingCreateTrusteeKeysOutput> {
        if (!input?.ElectionID || !input?.TrusteePersonIDs?.length || input.Threshold === undefined) {
            return { Success: false, Message: 'ElectionID, TrusteePersonIDs, and Threshold are required.' };
        }

        const ctx: VotingContext = { ContextUser: user, Provider: provider };

        try {
            const result = await TrusteeEngine.Instance.CreateTrusteeKeys(input, ctx);

            if (IsFailure(result)) {
                return { Success: false, Message: result.ErrorMessage };
            }

            return {
                Success: true,
                PublicKey: result.Value.PublicKey,
                Shares: result.Value.Shares,
            };
        } catch (e) {
            return FailOperation('Voting.CreateTrusteeKeys', e, { NameOnly: true });
        }
    }

    protected async Authorize(input: VotingCreateTrusteeKeysInput, user: UserInfo): Promise<boolean> {
        return VotingAuthorization.IsAdministrator(user);
    }
}

export function LoadCreateTrusteeKeysOperation(): void {
    // tree-shaking anchor
}
