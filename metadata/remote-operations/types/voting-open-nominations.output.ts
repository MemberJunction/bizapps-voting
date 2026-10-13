/**
 * Output for `Voting.OpenNominations`.
 *
 * NO import statements — definitions are emitted verbatim.
 */

export interface VotingOpenNominationsOutput {
  Success: boolean;
  Message?: string;
  /** The election's status after the change. */
  Status?: string;
}
