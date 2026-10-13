/**
 * @fileoverview `Voting.IssueSecondFactorPins` — issue second-factor PINs. The plain PINs are returned once; only salted hashes are stored.
 */

import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    VotingIssueSecondFactorPinsOperation as VotingIssueSecondFactorPinsOperationBase,
    type VotingIssueSecondFactorPinsInput,
    type VotingIssueSecondFactorPinsOutput,
} from '@mj-biz-apps/voting-entities';
import { type VotingContext, IsFailure } from '../shared/index.js';
import { FailOperation } from './operation-support.js';
import { VotingAuthorization } from '../shared/authorization.js';
import { CredentialEngine } from '../engines/index.js';

@RegisterClass(BaseRemotableOperation, 'Voting.IssueSecondFactorPins')
export class IssueSecondFactorPinsOperation extends VotingIssueSecondFactorPinsOperationBase {
    protected async InternalExecute(
        input: VotingIssueSecondFactorPinsInput,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<VotingIssueSecondFactorPinsOutput> {
        if (!input?.ElectionID) {
            return { Success: false, Message: 'ElectionID is required.' };
        }

        const ctx: VotingContext = { ContextUser: user, Provider: provider };

        try {
            const result = await CredentialEngine.Instance.IssueSecondFactorPins(input, ctx);

            if (IsFailure(result)) {
                return { Success: false, Message: result.ErrorMessage };
            }

            return { Success: true, Issued: result.Value.Pins, Skipped: result.Value.Skipped };
        } catch (e) {
            return FailOperation('Voting.IssueSecondFactorPins', e, { NameOnly: true });
        }
    }

    protected async Authorize(input: VotingIssueSecondFactorPinsInput, user: UserInfo): Promise<boolean> {
        return VotingAuthorization.IsAdministrator(user);
    }
}

export function LoadIssueSecondFactorPinsOperation(): void {
    // tree-shaking anchor
}
