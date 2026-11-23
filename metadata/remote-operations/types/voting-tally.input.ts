/**
 * Input for `Voting.Tally`.
 *
 * NO import statements — definitions are emitted verbatim.
 */

export interface VotingTallyInput {
  /** The closed election to tally. */
  ElectionID: string;
  /** Optional seed for reproducible tie-breaking by lot. */
  TieBreakSeed?: string;
}
