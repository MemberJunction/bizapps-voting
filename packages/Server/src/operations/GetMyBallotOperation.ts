/**
 * @fileoverview `Voting.GetMyBallot` — retrieve the ballot style for the calling voter.
 *
 * Voters (including guests with a scoped session) retrieve the ballot they will fill.
 * The Hash allows clients to detect style changes between preview and submission.
 */

import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    VotingGetMyBallotOperation as VotingGetMyBallotOperationBase,
    type VotingGetMyBallotInput,
    type VotingGetMyBallotOutput,
} from '@mj-biz-apps/voting-entities';
import { VoterIdentityResolver, type VotingContext, LoadElectionGraph, IsFailure, GuestMayAccessElection, SystemContext } from '../shared/index.js';
import { DescribeMyBallotState, FailOperation } from './operation-support.js';
import { BallotStyleBuilder, CastEngine, VoterRollEngine } from '../engines/index.js';
import { DEFAULT_BALLOT_LANGUAGE } from '../engines/ballot-style-builder.js';

@RegisterClass(BaseRemotableOperation, 'Voting.GetMyBallot')
export class GetMyBallotOperation extends VotingGetMyBallotOperationBase {
    protected async InternalExecute(
        input: VotingGetMyBallotInput,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<VotingGetMyBallotOutput> {
        if (!input?.ElectionID) {
            return { Success: false, Message: 'ElectionID is required.' };
        }

        const ctx: VotingContext = { ContextUser: user, Provider: provider };

        // Resolve the voter identity (guest or MJ session)
        const identity = await VoterIdentityResolver.Resolve(input.ElectionID, ctx);
        if (!identity) {
            return { Success: false, Message: 'You are not on the roll for this election.' };
        }

        try {
            // Load the election graph
            const graphResult = await LoadElectionGraph(input.ElectionID, ctx);
            if (IsFailure(graphResult)) {
                return { Success: false, Message: graphResult.ErrorMessage };
            }

            const graph = graphResult.Value;

            // The ballot is the one this voter's class is shown, in the default language (the input carries none).
            const voterResult = await VoterRollEngine.Instance.GetVoter(identity.EligibleVoterID, SystemContext(ctx));
            if (IsFailure(voterResult)) {
                return { Success: false, Message: voterResult.ErrorMessage };
            }
            const style = await BallotStyleBuilder.Instance.Build(graph, voterResult.Value.VotingClass, input.Language || DEFAULT_BALLOT_LANGUAGE, ctx);

            const participation = await CastEngine.Instance.GetMyParticipation(input.ElectionID, identity.EligibleVoterID, ctx);
            if (IsFailure(participation)) {
                return { Success: false, Message: participation.ErrorMessage };
            }

            return { Success: true, Style: style, ...DescribeMyBallotState(participation.Value) };
        } catch (e) {
            return FailOperation('Voting.GetMyBallot', e);
        }
    }

    protected async Authorize(input: VotingGetMyBallotInput, user: UserInfo): Promise<boolean> {
        // Voter ops allow guests scoped to this election
        return GuestMayAccessElection(user, input.ElectionID);
    }
}

export function LoadGetMyBallotOperation(): void {
    // tree-shaking anchor
}
