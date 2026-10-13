/**
 * @fileoverview `Voting.VerifyReceipt` — verify a ballot receipt code.
 *
 * Checks whether a receipt code corresponds to a ballot recorded in this election.
 * Returns Found (receipt exists) and Counted (ballot is counted in results).
 */

import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    VotingVerifyReceiptOperation as VotingVerifyReceiptOperationBase,
    type VotingVerifyReceiptInput,
    type VotingVerifyReceiptOutput,
} from '@mj-biz-apps/voting-entities';
import { type VotingContext, IsFailure, GuestMayAccessElection } from '../shared/index.js';
import { EngineContextAfterAuthorization, FailOperation } from './operation-support.js';
import { CastEngine } from '../engines/index.js';

@RegisterClass(BaseRemotableOperation, 'Voting.VerifyReceipt')
export class VerifyReceiptOperation extends VotingVerifyReceiptOperationBase {
    protected async InternalExecute(
        input: VotingVerifyReceiptInput,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<VotingVerifyReceiptOutput> {
        if (!input?.ElectionID || !input?.ReceiptCode) {
            return { Success: false, Message: 'ElectionID and ReceiptCode are required.' };
        }

        const ctx: VotingContext = { ContextUser: user, Provider: provider };

        try {
            const result = await CastEngine.Instance.VerifyReceipt(input.ElectionID, input.ReceiptCode, EngineContextAfterAuthorization(ctx));

            if (IsFailure(result)) {
                return { Success: false, Message: result.ErrorMessage };
            }

            return {
                Success: true,
                Found: result.Value.Found,
                Counted: result.Value.Counted,
            };
        } catch (e) {
            return FailOperation('Voting.VerifyReceipt', e);
        }
    }

    protected async Authorize(input: VotingVerifyReceiptInput, user: UserInfo): Promise<boolean> {
        return GuestMayAccessElection(user, input.ElectionID);
    }
}

export function LoadVerifyReceiptOperation(): void {
    // tree-shaking anchor
}
