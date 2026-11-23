/**
 * Input for `Voting.CancelElection`.
 *
 * NO import statements — definitions are emitted verbatim.
 */

export interface VotingCancelElectionInput {
  /** The election to cancel. */
  ElectionID: string;
  /** Reason for cancellation. */
  Reason: string;
}
