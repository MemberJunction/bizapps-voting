/**
 * @fileoverview `Voting.IssueControlNumbers` — issue one-time control numbers for paper and proxy ballots. The plain numbers are returned once; only their hashes are stored.
 */

import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    VotingIssueControlNumbersOperation as VotingIssueControlNumbersOperationBase,
    type VotingIssueControlNumbersInput,
    type VotingIssueControlNumbersOutput,
} from '@mj-biz-apps/voting-entities';
import { type VotingContext, IsFailure } from '../shared/index.js';
import { FailOperation } from './operation-support.js';
import { VotingAuthorization } from '../shared/authorization.js';
import { CredentialEngine } from '../engines/index.js';

@RegisterClass(BaseRemotableOperation, 'Voting.IssueControlNumbers')
export class IssueControlNumbersOperation extends VotingIssueControlNumbersOperationBase {
    protected async InternalExecute(
        input: VotingIssueControlNumbersInput,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<VotingIssueControlNumbersOutput> {
        if (!input?.ElectionID) {
            return { Success: false, Message: 'ElectionID is required.' };
        }

        const ctx: VotingContext = { ContextUser: user, Provider: provider };

        try {
            const result = await CredentialEngine.Instance.IssueControlNumbers(input, ctx);

            if (IsFailure(result)) {
                return { Success: false, Message: result.ErrorMessage };
            }

            return { Success: true, Issued: result.Value.Numbers, Skipped: result.Value.Skipped };
        } catch (e) {
            return FailOperation('Voting.IssueControlNumbers', e, { NameOnly: true });
        }
    }

    protected async Authorize(input: VotingIssueControlNumbersInput, user: UserInfo): Promise<boolean> {
        return VotingAuthorization.IsAdministrator(user);
    }
}

export function LoadIssueControlNumbersOperation(): void {
    // tree-shaking anchor
}
