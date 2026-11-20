/**
 * Input for `Voting.Certify`.
 *
 * NO import statements — definitions are emitted verbatim.
 */

export interface VotingCertifyInput {
  /** The tallied election to certify. */
  ElectionID: string;
  /** Optional notes for the certification record. */
  Notes?: string;
}
