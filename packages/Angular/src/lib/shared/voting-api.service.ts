/**
 * VotingApiService — a thin typed wrapper over the generated Voting Remote Operations.
 *
 * Each operation's `Execute(input)` routes through the active metadata provider, so the service
 * needs no provider of its own. It folds the two failure channels (the envelope's `ErrorMessage`
 * and the output's own `Success`/`Message`) into one {@link OperationResult}.
 */
import { Injectable } from '@angular/core';
import { BaseRemotableOperation } from '@memberjunction/core';
import {
    VotingAmendRollOperation,
    VotingCancelElectionOperation,
    VotingCertifyOperation,
    VotingChallengeVoterOperation,
    VotingCloseElectionOperation,
    VotingCreateElectionOperation,
    VotingFreezeRollOperation,
    VotingGetTurnoutOperation,
    VotingIssueCredentialsOperation,
    VotingOpenElectionOperation,
    VotingTallyOperation,
    VotingCloseNominationsOperation,
    VotingDecideNominationOperation,
    VotingDecideProxyOperation,
    VotingIssueControlNumbersOperation,
    VotingIssueSecondFactorPinsOperation,
    VotingOpenNominationsOperation,
    VotingUpdateElectionOperation,
    type VotingAmendRollInput,
    type VotingAmendRollOutput,
    type VotingCancelElectionInput,
    type VotingCancelElectionOutput,
    type VotingCertifyInput,
    type VotingCertifyOutput,
    type VotingChallengeVoterInput,
    type VotingChallengeVoterOutput,
    type VotingCloseElectionInput,
    type VotingCloseElectionOutput,
    type VotingCreateElectionInput,
    type VotingCreateElectionOutput,
    type VotingFreezeRollInput,
    type VotingFreezeRollOutput,
    type VotingGetTurnoutInput,
    type VotingGetTurnoutOutput,
    type VotingIssueCredentialsInput,
    type VotingIssueCredentialsOutput,
    type VotingOpenElectionInput,
    type VotingOpenElectionOutput,
    type VotingTallyInput,
    type VotingCloseNominationsInput,
    type VotingCloseNominationsOutput,
    type VotingDecideNominationInput,
    type VotingDecideNominationOutput,
    type VotingDecideProxyInput,
    type VotingDecideProxyOutput,
    type VotingIssueControlNumbersInput,
    type VotingIssueControlNumbersOutput,
    type VotingIssueSecondFactorPinsInput,
    type VotingIssueSecondFactorPinsOutput,
    type VotingOpenNominationsInput,
    type VotingOpenNominationsOutput,
    type VotingTallyOutput,
    type VotingUpdateElectionInput,
    type VotingUpdateElectionOutput,
} from '@mj-biz-apps/voting-entities';

/** Result of an operation: `Success` is true only when the envelope and the typed output both succeeded. */
export interface OperationResult<T> {
    Success: boolean;
    /** A presentable failure message when `Success` is false; the output's own message otherwise, if any. */
    Message?: string;
    Output?: T;
}

@Injectable({ providedIn: 'root' })
export class VotingApiService {
    public CreateElection(input: VotingCreateElectionInput): Promise<OperationResult<VotingCreateElectionOutput>> {
        return this.Run(new VotingCreateElectionOperation(), input, 'The election could not be created.');
    }

    public UpdateElection(input: VotingUpdateElectionInput): Promise<OperationResult<VotingUpdateElectionOutput>> {
        return this.Run(new VotingUpdateElectionOperation(), input, 'The election could not be updated.');
    }

    public OpenElection(input: VotingOpenElectionInput): Promise<OperationResult<VotingOpenElectionOutput>> {
        return this.Run(new VotingOpenElectionOperation(), input, 'The election could not be opened.');
    }

    public CloseElection(input: VotingCloseElectionInput): Promise<OperationResult<VotingCloseElectionOutput>> {
        return this.Run(new VotingCloseElectionOperation(), input, 'The election could not be closed.');
    }

    public CancelElection(input: VotingCancelElectionInput): Promise<OperationResult<VotingCancelElectionOutput>> {
        return this.Run(new VotingCancelElectionOperation(), input, 'The election could not be cancelled.');
    }

    public Tally(input: VotingTallyInput): Promise<OperationResult<VotingTallyOutput>> {
        return this.Run(new VotingTallyOperation(), input, 'The election could not be tallied.');
    }

    public Certify(input: VotingCertifyInput): Promise<OperationResult<VotingCertifyOutput>> {
        return this.Run(new VotingCertifyOperation(), input, 'The election could not be certified.');
    }

    public FreezeRoll(input: VotingFreezeRollInput): Promise<OperationResult<VotingFreezeRollOutput>> {
        return this.Run(new VotingFreezeRollOperation(), input, 'The roll could not be frozen.');
    }

    public AmendRoll(input: VotingAmendRollInput): Promise<OperationResult<VotingAmendRollOutput>> {
        return this.Run(new VotingAmendRollOperation(), input, 'The roll could not be amended.');
    }

    public ChallengeVoter(input: VotingChallengeVoterInput): Promise<OperationResult<VotingChallengeVoterOutput>> {
        return this.Run(new VotingChallengeVoterOperation(), input, 'The challenge could not be recorded.');
    }

    public IssueCredentials(input: VotingIssueCredentialsInput): Promise<OperationResult<VotingIssueCredentialsOutput>> {
        return this.Run(new VotingIssueCredentialsOperation(), input, 'Credentials could not be issued.');
    }

    public GetTurnout(input: VotingGetTurnoutInput): Promise<OperationResult<VotingGetTurnoutOutput>> {
        return this.Run(new VotingGetTurnoutOperation(), input, 'Turnout could not be retrieved.');
    }

    public CloseNominations(input: VotingCloseNominationsInput): Promise<OperationResult<VotingCloseNominationsOutput>> {
        return this.Run(new VotingCloseNominationsOperation(), input, 'Nominations could not be closed.');
    }

    public DecideNomination(input: VotingDecideNominationInput): Promise<OperationResult<VotingDecideNominationOutput>> {
        return this.Run(new VotingDecideNominationOperation(), input, 'The nomination could not be decided.');
    }

    public DecideProxy(input: VotingDecideProxyInput): Promise<OperationResult<VotingDecideProxyOutput>> {
        return this.Run(new VotingDecideProxyOperation(), input, 'The proxy designation could not be decided.');
    }

    public IssueControlNumbers(input: VotingIssueControlNumbersInput): Promise<OperationResult<VotingIssueControlNumbersOutput>> {
        return this.Run(new VotingIssueControlNumbersOperation(), input, 'Control numbers could not be issued.');
    }

    public IssueSecondFactorPins(input: VotingIssueSecondFactorPinsInput): Promise<OperationResult<VotingIssueSecondFactorPinsOutput>> {
        return this.Run(new VotingIssueSecondFactorPinsOperation(), input, 'PINs could not be issued.');
    }

    public OpenNominations(input: VotingOpenNominationsInput): Promise<OperationResult<VotingOpenNominationsOutput>> {
        return this.Run(new VotingOpenNominationsOperation(), input, 'Nominations could not be opened.');
    }

    private async Run<TInput, TOutput extends { Success: boolean; Message?: string }>(
        operation: BaseRemotableOperation<TInput, TOutput>,
        input: TInput,
        fallbackMessage: string
    ): Promise<OperationResult<TOutput>> {
        try {
            const result = await operation.Execute(input);
            if (!result.Success || !result.Output) {
                return { Success: false, Message: result.ErrorMessage ?? fallbackMessage };
            }
            if (!result.Output.Success) {
                return { Success: false, Message: result.Output.Message ?? fallbackMessage, Output: result.Output };
            }
            return { Success: true, Message: result.Output.Message, Output: result.Output };
        } catch (error) {
            return { Success: false, Message: error instanceof Error ? error.message : fallbackMessage };
        }
    }
}
