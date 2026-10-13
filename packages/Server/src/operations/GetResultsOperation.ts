/**
 * @fileoverview `Voting.GetResults` — retrieve election results.
 *
 * Returns results subject to ResultsTiming and ResultsAudience settings.
 * Anyone can call GetResults; the engine returns Visible=false with a Reason when access is denied.
 */

import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    VotingGetResultsOperation as VotingGetResultsOperationBase,
    type VotingGetResultsInput,
    type VotingGetResultsOutput,
} from '@mj-biz-apps/voting-entities';
import { type VotingContext, IsFailure, IsGuestPrincipal, GuestMayAccessElection, VoterIdentityResolver } from '../shared/index.js';
import { BuildResultsViewer, FailOperation } from './operation-support.js';
import { CastEngine, ResultsEngine } from '../engines/index.js';
import { VotingAuthorization } from '../shared/authorization.js';

@RegisterClass(BaseRemotableOperation, 'Voting.GetResults')
export class GetResultsOperation extends VotingGetResultsOperationBase {
    protected async InternalExecute(
        input: VotingGetResultsInput,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<VotingGetResultsOutput> {
        if (!input?.ElectionID) {
            return { Success: false, Message: 'ElectionID is required.' };
        }

        const ctx: VotingContext = { ContextUser: user, Provider: provider };

        try {
            // Who is asking, as far as the visibility rule cares: role, roll entry, poll-book state, host membership.
            // A caller who is not on the roll resolves to a null identity and is simply not eligible.
            const identity = await VoterIdentityResolver.Resolve(input.ElectionID, ctx);
            let hasVoted = false;
            if (identity) {
                const participation = await CastEngine.Instance.GetMyParticipation(input.ElectionID, identity.EligibleVoterID, ctx);
                hasVoted = !IsFailure(participation) && participation.Value.HasVoted;
            }
            const viewer = BuildResultsViewer({
                IsAdministrator: VotingAuthorization.IsAdministrator(user),
                IsGuest: IsGuestPrincipal(user),
                HasUserID: !!user?.ID,
                Identity: identity,
                HasVoted: hasVoted,
            });

            const result = await ResultsEngine.Instance.GetResults(input.ElectionID, viewer, ctx);

            if (IsFailure(result)) {
                return { Success: false, Message: result.ErrorMessage };
            }

            return {
                Success: true,
                Visible: result.Value.Visible,
                Reason: result.Value.Reason,
                IsFinal: result.Value.IsFinal,
                IsRunning: result.Value.IsRunning,
                SnapshotAt: result.Value.SnapshotAt,
                BallotCount: result.Value.BallotCount,
                Contests: result.Value.Contests,
            };
        } catch (e) {
            return FailOperation('Voting.GetResults', e);
        }
    }

    protected async Authorize(input: VotingGetResultsInput, user: UserInfo): Promise<boolean> {
        // Visibility itself is the engine's call; this only keeps guests inside their own election.
        return GuestMayAccessElection(user, input.ElectionID);
    }
}

export function LoadGetResultsOperation(): void {
    // tree-shaking anchor
}
