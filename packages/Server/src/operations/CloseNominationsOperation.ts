/**
 * @fileoverview `Voting.CloseNominations` — move an election from Nominations to Ready.
 */

import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    VotingCloseNominationsOperation as VotingCloseNominationsOperationBase,
    type VotingCloseNominationsInput,
    type VotingCloseNominationsOutput,
} from '@mj-biz-apps/voting-entities';
import { type VotingContext, IsFailure } from '../shared/index.js';
import { FailOperation } from './operation-support.js';
import { VotingAuthorization } from '../shared/authorization.js';
import { ElectionAdministrationEngine } from '../engines/index.js';

@RegisterClass(BaseRemotableOperation, 'Voting.CloseNominations')
export class CloseNominationsOperation extends VotingCloseNominationsOperationBase {
    protected async InternalExecute(
        input: VotingCloseNominationsInput,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<VotingCloseNominationsOutput> {
        if (!input?.ElectionID) {
            return { Success: false, Message: 'ElectionID is required.' };
        }

        const ctx: VotingContext = { ContextUser: user, Provider: provider };

        try {
            const result = await ElectionAdministrationEngine.Instance.CloseNominations(input.ElectionID, ctx);

            if (IsFailure(result)) {
                return { Success: false, Message: result.ErrorMessage };
            }

            return { Success: true, Status: result.Value.Status };
        } catch (e) {
            return FailOperation('Voting.CloseNominations', e);
        }
    }

    protected async Authorize(input: VotingCloseNominationsInput, user: UserInfo): Promise<boolean> {
        return VotingAuthorization.IsAdministrator(user);
    }
}

export function LoadCloseNominationsOperation(): void {
    // tree-shaking anchor
}
