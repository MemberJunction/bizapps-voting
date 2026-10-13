/**
 * @fileoverview `Voting.GetMyParticipation` — check if the calling voter has voted.
 *
 * Returns HasVoted and the channel (Online, Paper, Proxy, InPerson).
 * Never reveals what they voted.
 */

import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    VotingGetMyParticipationOperation as VotingGetMyParticipationOperationBase,
    type VotingGetMyParticipationInput,
    type VotingGetMyParticipationOutput,
} from '@mj-biz-apps/voting-entities';
import { type VotingContext, IsFailure, GuestMayAccessElection } from '../shared/index.js';
import { FailOperation, NOT_ON_ROLL_MESSAGE, OpenVoterSession } from './operation-support.js';
import { CastEngine } from '../engines/index.js';

@RegisterClass(BaseRemotableOperation, 'Voting.GetMyParticipation')
export class GetMyParticipationOperation extends VotingGetMyParticipationOperationBase {
    protected async InternalExecute(
        input: VotingGetMyParticipationInput,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<VotingGetMyParticipationOutput> {
        if (!input?.ElectionID) {
            return { Success: false, Message: 'ElectionID is required.' };
        }

        const ctx: VotingContext = { ContextUser: user, Provider: provider };

        const session = await OpenVoterSession(input.ElectionID, ctx);
        if (!session) {
            return { Success: false, Message: NOT_ON_ROLL_MESSAGE };
        }
        const { Identity: identity, Engine: engine } = session;

        try {
            const result = await CastEngine.Instance.GetMyParticipation(input.ElectionID, identity.EligibleVoterID, engine);

            if (IsFailure(result)) {
                return { Success: false, Message: result.ErrorMessage };
            }

            return {
                Success: true,
                HasVoted: result.Value.HasVoted,
                Channel: result.Value.Channel,
            };
        } catch (e) {
            return FailOperation('Voting.GetMyParticipation', e);
        }
    }

    protected async Authorize(input: VotingGetMyParticipationInput, user: UserInfo): Promise<boolean> {
        return GuestMayAccessElection(user, input.ElectionID);
    }
}

export function LoadGetMyParticipationOperation(): void {
    // tree-shaking anchor
}
