/**
 * Output for `Voting.CloseNominations`.
 *
 * NO import statements — definitions are emitted verbatim.
 */

export interface VotingCloseNominationsOutput {
  Success: boolean;
  Message?: string;
  /** The election's status after the change. */
  Status?: string;
}
