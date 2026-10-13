/**
 * Input for `Voting.GetMyBallot`.
 *
 * NO import statements — definitions are emitted verbatim.
 */

export interface VotingGetMyBallotInput {
  /** The election for which to retrieve the ballot style. */
  ElectionID: string;
  /** Language the ballot is shown in (part of the ballot-style hash). Defaults to the distribution or English. */
  Language?: string;
}
