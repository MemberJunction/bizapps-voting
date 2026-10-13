/**
 * @fileoverview `Voting.DecideProxy` — accept or reject a Pending proxy designation.
 */

import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    VotingDecideProxyOperation as VotingDecideProxyOperationBase,
    type VotingDecideProxyInput,
    type VotingDecideProxyOutput,
} from '@mj-biz-apps/voting-entities';
import { type VotingContext, IsFailure } from '../shared/index.js';
import { FailOperation } from './operation-support.js';
import { VotingAuthorization } from '../shared/authorization.js';
import { VoterRollEngine } from '../engines/index.js';

@RegisterClass(BaseRemotableOperation, 'Voting.DecideProxy')
export class DecideProxyOperation extends VotingDecideProxyOperationBase {
    protected async InternalExecute(
        input: VotingDecideProxyInput,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<VotingDecideProxyOutput> {
        if (!input?.ProxyDesignationID || !input?.Decision) {
            return { Success: false, Message: 'ProxyDesignationID and Decision are required.' };
        }

        const ctx: VotingContext = { ContextUser: user, Provider: provider };

        try {
            const result = await VoterRollEngine.Instance.DecideProxy(input, ctx);

            if (IsFailure(result)) {
                return { Success: false, Message: result.ErrorMessage };
            }

            return { Success: true, Status: result.Value.Status };
        } catch (e) {
            return FailOperation('Voting.DecideProxy', e);
        }
    }

    protected async Authorize(input: VotingDecideProxyInput, user: UserInfo): Promise<boolean> {
        return VotingAuthorization.IsAdministrator(user);
    }
}

export function LoadDecideProxyOperation(): void {
    // tree-shaking anchor
}
