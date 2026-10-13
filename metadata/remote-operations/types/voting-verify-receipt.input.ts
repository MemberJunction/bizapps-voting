/**
 * Input for `Voting.VerifyReceipt`.
 *
 * NO import statements — definitions are emitted verbatim.
 */

export interface VotingVerifyReceiptInput {
  /** The election the ballot was cast in. */
  ElectionID: string;
  /** The receipt code returned by CastBallot. */
  ReceiptCode: string;
}
