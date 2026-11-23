/**
 * Input for `Voting.CreateTrusteeKeys`.
 *
 * NO import statements — definitions are emitted verbatim.
 */

export interface VotingCreateTrusteeKeysInput {
  /** The election to generate keys for. */
  ElectionID: string;
  /** PersonIDs of trustees who will receive shares. */
  TrusteePersonIDs: string[];
  /** k-of-n threshold: how many shares are needed to reconstruct the key. */
  Threshold: number;
}
