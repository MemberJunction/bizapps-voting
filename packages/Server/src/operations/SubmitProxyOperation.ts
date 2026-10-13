/**
 * @fileoverview `Voting.SubmitProxy` — designate another eligible voter as a proxy.
 *
 * The calling voter designates a proxy to vote on their behalf,
 * with optional scope limiting and instructions.
 */

import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    VotingSubmitProxyOperation as VotingSubmitProxyOperationBase,
    type VotingSubmitProxyInput,
    type VotingSubmitProxyOutput,
} from '@mj-biz-apps/voting-entities';
import { VoterIdentityResolver, type VotingContext, IsFailure, GuestMayAccessElection } from '../shared/index.js';
import { FailOperation } from './operation-support.js';
import { VoterRollEngine } from '../engines/index.js';

@RegisterClass(BaseRemotableOperation, 'Voting.SubmitProxy')
export class SubmitProxyOperation extends VotingSubmitProxyOperationBase {
    protected async InternalExecute(
        input: VotingSubmitProxyInput,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<VotingSubmitProxyOutput> {
        if (!input?.ElectionID || !input?.ProxyPersonID) {
            return { Success: false, Message: 'ElectionID and ProxyPersonID are required.' };
        }

        const ctx: VotingContext = { ContextUser: user, Provider: provider };

        const identity = await VoterIdentityResolver.Resolve(input.ElectionID, ctx);
        if (!identity) {
            return { Success: false, Message: 'You are not on the roll for this election.' };
        }

        try {
            const result = await VoterRollEngine.Instance.SubmitProxy(input, identity, ctx);

            if (IsFailure(result)) {
                return { Success: false, Message: result.ErrorMessage };
            }

            return {
                Success: true,
                ProxyDesignationID: result.Value.ProxyDesignationID,
            };
        } catch (e) {
            return FailOperation('Voting.SubmitProxy', e);
        }
    }

    protected async Authorize(input: VotingSubmitProxyInput, user: UserInfo): Promise<boolean> {
        return GuestMayAccessElection(user, input.ElectionID);
    }
}

export function LoadSubmitProxyOperation(): void {
    // tree-shaking anchor
}
