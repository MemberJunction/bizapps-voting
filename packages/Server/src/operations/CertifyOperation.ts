/**
 * @fileoverview `Voting.Certify` — certify the election results.
 *
 * Produces an immutable record of the outcome, turnout, and inspector signatures.
 */

import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    VotingCertifyOperation as VotingCertifyOperationBase,
    type VotingCertifyInput,
    type VotingCertifyOutput,
} from '@mj-biz-apps/voting-entities';
import { type VotingContext, IsFailure } from '../shared/index.js';
import { FailOperation } from './operation-support.js';
import { VotingAuthorization } from '../shared/authorization.js';
import { CertificationEngine } from '../engines/index.js';

@RegisterClass(BaseRemotableOperation, 'Voting.Certify')
export class CertifyOperation extends VotingCertifyOperationBase {
    protected async InternalExecute(
        input: VotingCertifyInput,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<VotingCertifyOutput> {
        if (!input?.ElectionID) {
            return { Success: false, Message: 'ElectionID is required.' };
        }

        const ctx: VotingContext = { ContextUser: user, Provider: provider };

        try {
            const result = await CertificationEngine.Instance.Certify(input.ElectionID, input.Notes, ctx);

            if (IsFailure(result)) {
                return { Success: false, Message: result.ErrorMessage };
            }

            return {
                Success: true,
                CertificationID: result.Value.CertificationID,
                Status: result.Value.Status,
            };
        } catch (e) {
            return FailOperation('Voting.Certify', e);
        }
    }

    protected async Authorize(input: VotingCertifyInput, user: UserInfo): Promise<boolean> {
        return VotingAuthorization.IsAdministrator(user) || VotingAuthorization.IsInspector(user);
    }
}

export function LoadCertifyOperation(): void {
    // tree-shaking anchor
}
