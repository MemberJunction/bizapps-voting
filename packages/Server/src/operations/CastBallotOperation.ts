/**
 * @fileoverview `Voting.CastBallot` — record a voter's ballot selections.
 *
 * Records one all-or-nothing write to both the poll book (Participation)
 * and the ballot box (CastBallot), encrypted Selections, returning a receipt.
 * Never logs the submission content.
 */

import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    VotingCastBallotOperation as VotingCastBallotOperationBase,
    type VotingCastBallotInput,
    type VotingCastBallotOutput,
} from '@mj-biz-apps/voting-entities';
import { type VotingContext, IsFailure, GuestMayAccessElection } from '../shared/index.js';
import { FailOperation, NOT_ON_ROLL_MESSAGE, OpenVoterSession, ResolveCredentialMethodID } from './operation-support.js';
import { CastEngine } from '../engines/index.js';

@RegisterClass(BaseRemotableOperation, 'Voting.CastBallot')
export class CastBallotOperation extends VotingCastBallotOperationBase {
    protected async InternalExecute(
        input: VotingCastBallotInput,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<VotingCastBallotOutput> {
        if (!input?.ElectionID || !input?.BallotStyleHash || !input?.Submission) {
            return { Success: false, Message: 'ElectionID, BallotStyleHash, and Submission are required.' };
        }

        const ctx: VotingContext = { ContextUser: user, Provider: provider };

        // Authorize first (guest session scope or MJ user matched to the roll); the cast then runs as the system principal.
        const session = await OpenVoterSession(input.ElectionID, ctx);
        if (!session) {
            return { Success: false, Message: NOT_ON_ROLL_MESSAGE };
        }
        const { Identity: identity, Engine: engine } = session;

        try {
            // The guest token does not carry the credential method, so it is looked up (system context read).
            const credentialMethodID = await ResolveCredentialMethodID(identity, engine);
            const result = await CastEngine.Instance.Cast(
                {
                    ElectionID: input.ElectionID,
                    EligibleVoterID: identity.EligibleVoterID,
                    BallotStyleHash: input.BallotStyleHash,
                    Submission: input.Submission,
                    Channel: 'Online',
                    CredentialMethodID: credentialMethodID,
                    EnteredByUserID: undefined,
                    ProxyDesignationID: undefined,
                    Language: input.Language,
                },
                engine
            );

            if (IsFailure(result)) {
                return { Success: false, Message: result.ErrorMessage };
            }

            return {
                Success: true,
                ReceiptCode: result.Value.ReceiptCode,
            };
        } catch (e) {
            return FailOperation('Voting.CastBallot', e, { NameOnly: true });
        }
    }

    protected async Authorize(input: VotingCastBallotInput, user: UserInfo): Promise<boolean> {
        // Voter ops allow guests scoped to this election
        return GuestMayAccessElection(user, input.ElectionID);
    }
}

export function LoadCastBallotOperation(): void {
    // tree-shaking anchor
}
