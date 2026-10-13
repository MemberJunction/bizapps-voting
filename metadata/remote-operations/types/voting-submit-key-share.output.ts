/**
 * Output for `Voting.SubmitKeyShare`.
 *
 * NO import statements — definitions are emitted verbatim.
 */

export interface VotingSubmitKeyShareOutput {
  Success: boolean;
  Message?: string;
  Accepted?: boolean;
  SharesReceived?: number;
  SharesRequired?: number;
}
