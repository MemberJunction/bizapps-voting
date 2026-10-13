/**
 * @fileoverview `Voting.EnterPaperBallot` — record a paper or in-person ballot.
 *
 * Uses a control number to identify the voter and record their selections.
 */

import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    VotingEnterPaperBallotOperation as VotingEnterPaperBallotOperationBase,
    type VotingEnterPaperBallotInput,
    type VotingEnterPaperBallotOutput,
} from '@mj-biz-apps/voting-entities';
import { type VotingContext, IsFailure, LoadElectionGraph, SystemContext } from '../shared/index.js';
import { VotingAuthorization } from '../shared/authorization.js';
import { CredentialEngine, CastEngine, BallotStyleBuilder, VoterRollEngine } from '../engines/index.js';
import { DEFAULT_BALLOT_LANGUAGE } from '../engines/ballot-style-builder.js';
import { ErrorName, FailOperation } from './operation-support.js';
import { LogError } from '@memberjunction/core';

@RegisterClass(BaseRemotableOperation, 'Voting.EnterPaperBallot')
export class EnterPaperBallotOperation extends VotingEnterPaperBallotOperationBase {
    protected async InternalExecute(
        input: VotingEnterPaperBallotInput,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<VotingEnterPaperBallotOutput> {
        if (!input?.ElectionID || !input?.ControlNumber || !input?.Submission) {
            return { Success: false, Message: 'ElectionID, ControlNumber, and Submission are required.' };
        }

        const ctx: VotingContext = { ContextUser: user, Provider: provider };

        try {
            // Identify the voter from the control number WITHOUT consuming it: a rejected ballot must leave it usable.
            const voterResult = await CredentialEngine.Instance.VerifyControlNumber(input.ElectionID, input.ControlNumber, ctx, false);
            if (IsFailure(voterResult)) {
                return { Success: false, Message: voterResult.ErrorMessage };
            }
            const eligibleVoterID = voterResult.Value.EligibleVoterID;

            // The hash the engine will require is the one of THIS voter's ballot style (their voting class).
            const graphResult = await LoadElectionGraph(input.ElectionID, ctx);
            if (IsFailure(graphResult)) {
                return { Success: false, Message: graphResult.ErrorMessage };
            }
            const voter = await VoterRollEngine.Instance.GetVoter(eligibleVoterID, SystemContext(ctx));
            if (IsFailure(voter)) {
                return { Success: false, Message: voter.ErrorMessage };
            }
            const style = await BallotStyleBuilder.Instance.Build(graphResult.Value, voter.Value.VotingClass, DEFAULT_BALLOT_LANGUAGE, ctx);

            const castResult = await CastEngine.Instance.Cast(
                {
                    ElectionID: input.ElectionID,
                    EligibleVoterID: eligibleVoterID,
                    BallotStyleHash: style.Hash,
                    Submission: input.Submission,
                    Channel: input.Channel,
                    EnteredByUserID: user.ID,
                    Language: DEFAULT_BALLOT_LANGUAGE,
                },
                ctx
            );
            if (IsFailure(castResult)) {
                return { Success: false, Message: castResult.ErrorMessage };
            }

            // Only now burn the control number. The ballot is already recorded, so a failure here is logged, not surfaced as a failed cast.
            try {
                const consumed = await CredentialEngine.Instance.VerifyControlNumber(input.ElectionID, input.ControlNumber, ctx, true);
                if (IsFailure(consumed)) LogError(`Voting.EnterPaperBallot: control number not marked redeemed (${consumed.Code}).`);
            } catch (e) {
                LogError(`Voting.EnterPaperBallot: control number not marked redeemed (${ErrorName(e)}).`);
            }

            return { Success: true, ReceiptCode: castResult.Value.ReceiptCode };
        } catch (e) {
            return FailOperation('Voting.EnterPaperBallot', e, { NameOnly: true });
        }
    }

    protected async Authorize(input: VotingEnterPaperBallotInput, user: UserInfo): Promise<boolean> {
        return VotingAuthorization.IsAdministrator(user);
    }
}

export function LoadEnterPaperBallotOperation(): void {
    // tree-shaking anchor
}
