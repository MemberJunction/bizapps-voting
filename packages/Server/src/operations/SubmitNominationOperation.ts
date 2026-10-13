/**
 * @fileoverview `Voting.SubmitNomination` — nominate a candidate during the Nominations phase.
 *
 * Records a nomination with optional candidate statement.
 */

import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    VotingSubmitNominationOperation as VotingSubmitNominationOperationBase,
    type VotingSubmitNominationInput,
    type VotingSubmitNominationOutput,
    type mjBizAppsVotingContestEntity,
} from '@mj-biz-apps/voting-entities';
import { VoterIdentityResolver, type VotingContext, IsFailure, GuestMayAccessElection, SystemContext } from '../shared/index.js';
import { NominationEngine } from '../engines/index.js';
import { FailOperation, HoldsBallotSession } from './operation-support.js';

const CONTESTS_ENTITY = 'MJ_BizApps_Voting: Contests';

@RegisterClass(BaseRemotableOperation, 'Voting.SubmitNomination')
export class SubmitNominationOperation extends VotingSubmitNominationOperationBase {
    protected async InternalExecute(
        input: VotingSubmitNominationInput,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<VotingSubmitNominationOutput> {
        if (!input?.ContestID || !input?.NomineePersonID) {
            return { Success: false, Message: 'ContestID and NomineePersonID are required.' };
        }

        const ctx: VotingContext = { ContextUser: user, Provider: provider };

        try {
            // The contest names its election (read with the system user: a guest has no read rights on contests).
            const contest = await provider.GetEntityObject<mjBizAppsVotingContestEntity>(CONTESTS_ENTITY, SystemContext(ctx).ContextUser);
            if (!(await contest.Load(input.ContestID))) {
                return { Success: false, Message: 'The contest was not found.' };
            }
            const electionID = contest.ElectionID;

            // Authorize only saw the ContestID, so the guest-scope check for the contest's election happens here.
            if (!GuestMayAccessElection(user, electionID)) {
                return { Success: false, Message: 'You are not permitted to nominate in this election.' };
            }

            const identity = await VoterIdentityResolver.Resolve(electionID, ctx);
            if (!identity) {
                return { Success: false, Message: 'You are not on the roll for this election.' };
            }

            const result = await NominationEngine.Instance.SubmitNomination(input, identity, ctx);
            if (IsFailure(result)) {
                return { Success: false, Message: result.ErrorMessage };
            }

            return { Success: true, NominationID: result.Value.NominationID };
        } catch (e) {
            return FailOperation('Voting.SubmitNomination', e);
        }
    }

    protected async Authorize(input: VotingSubmitNominationInput, user: UserInfo): Promise<boolean> {
        // Only the ContestID is known here, so the election-level scope check is in InternalExecute.
        // A guest must at least hold a well-formed ballot-session scope.
        return HoldsBallotSession(user);
    }
}

export function LoadSubmitNominationOperation(): void {
    // tree-shaking anchor
}
