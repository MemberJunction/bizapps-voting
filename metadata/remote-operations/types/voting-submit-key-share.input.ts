/**
 * Input for `Voting.SubmitKeyShare`.
 *
 * NO import statements — definitions are emitted verbatim.
 */

export interface VotingSubmitKeyShareInput {
  /** The election for which the key share is being submitted. */
  ElectionID: string;
  /** The share index (assigned during CreateTrusteeKeys). */
  ShareIndex: number;
  /** The key share value. */
  Share: string;
}
