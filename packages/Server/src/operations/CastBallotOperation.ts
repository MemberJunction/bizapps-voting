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
import { VoterIdentityResolver, type VotingContext, IsFailure, GuestMayAccessElection } from '../shared/index.js';
import { FailOperation, ResolveCredentialMethodID } from './operation-support.js';
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

        // Resolve the voter identity (guest or MJ session)
        const identity = await VoterIdentityResolver.Resolve(input.ElectionID, ctx);
        if (!identity) {
            return { Success: false, Message: 'You are not on the roll for this election.' };
        }

        try {
            // The guest token does not carry the credential method, so it is looked up (system context read).
            const credentialMethodID = await ResolveCredentialMethodID(identity, ctx);
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
                ctx
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
