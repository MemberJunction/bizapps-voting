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
import { type VotingContext, IsFailure, IsGuestPrincipal, GuestMayAccessElection } from '../shared/index.js';
import { BuildResultsViewer, EngineContextAfterAuthorization, FailOperation, OpenVoterSession } from './operation-support.js';
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
            // The results tables are closed to ordinary users: the viewer rule below (the election's results audience and timing)
            // is the only gate, so the engine reads them as the system principal and applies that rule to this caller.
            const session = await OpenVoterSession(input.ElectionID, ctx);
            const engine = session?.Engine ?? EngineContextAfterAuthorization(ctx);
            const identity = session?.Identity ?? null;
            let hasVoted = false;
            if (identity) {
                const participation = await CastEngine.Instance.GetMyParticipation(input.ElectionID, identity.EligibleVoterID, engine);
                hasVoted = !IsFailure(participation) && participation.Value.HasVoted;
            }
            const viewer = BuildResultsViewer({
                // Inspectors see what administrators see: they observe the count and co-sign the certification.
                IsAdministrator: VotingAuthorization.IsAdministrator(user) || VotingAuthorization.IsInspector(user),
                IsGuest: IsGuestPrincipal(user),
                HasUserID: !!user?.ID,
                Identity: identity,
                HasVoted: hasVoted,
            });

            const result = await ResultsEngine.Instance.GetResults(input.ElectionID, viewer, engine);

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
