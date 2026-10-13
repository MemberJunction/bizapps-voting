/**
 * Input for `Voting.ResolveComment`.
 *
 * NO import statements — definitions are emitted verbatim.
 */

export interface VotingResolveCommentInput {
  /** The ballot comment to resolve. */
  BallotCommentID: string;
  /** Disposition of the comment (e.g., Acknowledged, Addressed). */
  Disposition: string;
  /** Optional response text. */
  Response?: string;
}
