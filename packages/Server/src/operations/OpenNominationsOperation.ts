/**
 * @fileoverview `Voting.OpenNominations` — move a Draft election into Nominations.
 */

import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    VotingOpenNominationsOperation as VotingOpenNominationsOperationBase,
    type VotingOpenNominationsInput,
    type VotingOpenNominationsOutput,
} from '@mj-biz-apps/voting-entities';
import { type VotingContext, IsFailure } from '../shared/index.js';
import { FailOperation } from './operation-support.js';
import { VotingAuthorization } from '../shared/authorization.js';
import { ElectionAdministrationEngine } from '../engines/index.js';

@RegisterClass(BaseRemotableOperation, 'Voting.OpenNominations')
export class OpenNominationsOperation extends VotingOpenNominationsOperationBase {
    protected async InternalExecute(
        input: VotingOpenNominationsInput,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<VotingOpenNominationsOutput> {
        if (!input?.ElectionID) {
            return { Success: false, Message: 'ElectionID is required.' };
        }

        const ctx: VotingContext = { ContextUser: user, Provider: provider };

        try {
            const result = await ElectionAdministrationEngine.Instance.OpenNominations(input.ElectionID, ctx);

            if (IsFailure(result)) {
                return { Success: false, Message: result.ErrorMessage };
            }

            return { Success: true, Status: result.Value.Status };
        } catch (e) {
            return FailOperation('Voting.OpenNominations', e);
        }
    }

    protected async Authorize(input: VotingOpenNominationsInput, user: UserInfo): Promise<boolean> {
        return VotingAuthorization.IsAdministrator(user);
    }
}

export function LoadOpenNominationsOperation(): void {
    // tree-shaking anchor
}
