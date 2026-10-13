/**
 * @fileoverview `Voting.IssueCredentials` — issue voter credentials.
 *
 * Issues magic links, control numbers, or asserted identities.
 */

import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    VotingIssueCredentialsOperation as VotingIssueCredentialsOperationBase,
    type VotingIssueCredentialsInput,
    type VotingIssueCredentialsOutput,
} from '@mj-biz-apps/voting-entities';
import { type VotingContext, IsFailure } from '../shared/index.js';
import { FailOperation } from './operation-support.js';
import { VotingAuthorization } from '../shared/authorization.js';
import { CredentialEngine } from '../engines/index.js';

@RegisterClass(BaseRemotableOperation, 'Voting.IssueCredentials')
export class IssueCredentialsOperation extends VotingIssueCredentialsOperationBase {
    protected async InternalExecute(
        input: VotingIssueCredentialsInput,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<VotingIssueCredentialsOutput> {
        if (!input?.ElectionID || !input?.MethodCode) {
            return { Success: false, Message: 'ElectionID and MethodCode are required.' };
        }

        const ctx: VotingContext = { ContextUser: user, Provider: provider };

        try {
            const result = await CredentialEngine.Instance.IssueCredentials(input, ctx);

            if (IsFailure(result)) {
                return { Success: false, Message: result.ErrorMessage };
            }

            return {
                Success: true,
                Issued: result.Value.Issued,
                Skipped: result.Value.Skipped,
            };
        } catch (e) {
            return FailOperation('Voting.IssueCredentials', e);
        }
    }

    protected async Authorize(input: VotingIssueCredentialsInput, user: UserInfo): Promise<boolean> {
        return VotingAuthorization.IsAdministrator(user);
    }
}

export function LoadIssueCredentialsOperation(): void {
    // tree-shaking anchor
}
