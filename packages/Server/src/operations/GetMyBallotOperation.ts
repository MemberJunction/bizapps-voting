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
import { type VotingContext, LoadElectionGraph, IsFailure, GuestMayAccessElection } from '../shared/index.js';
import { DescribeMyBallotState, FailOperation, NOT_ON_ROLL_MESSAGE, OpenVoterSession } from './operation-support.js';
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

        // Authorize first (guest session scope or MJ user matched to the roll); the engines then run as the system principal.
        const session = await OpenVoterSession(input.ElectionID, ctx);
        if (!session) {
            return { Success: false, Message: NOT_ON_ROLL_MESSAGE };
        }
        const { Identity: identity, Engine: engine } = session;

        try {
            // Load the election graph
            const graphResult = await LoadElectionGraph(input.ElectionID, engine);
            if (IsFailure(graphResult)) {
                return { Success: false, Message: graphResult.ErrorMessage };
            }

            const graph = graphResult.Value;

            // The ballot is the one this voter's class is shown, in the default language (the input carries none).
            const voterResult = await VoterRollEngine.Instance.GetVoter(identity.EligibleVoterID, engine);
            if (IsFailure(voterResult)) {
                return { Success: false, Message: voterResult.ErrorMessage };
            }
            const style = await BallotStyleBuilder.Instance.Build(graph, voterResult.Value.VotingClass, input.Language || DEFAULT_BALLOT_LANGUAGE, engine);

            const participation = await CastEngine.Instance.GetMyParticipation(input.ElectionID, identity.EligibleVoterID, engine);
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
