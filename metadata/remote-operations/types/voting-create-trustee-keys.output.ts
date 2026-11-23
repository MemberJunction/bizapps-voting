/**
 * Output for `Voting.CreateTrusteeKeys`.
 *
 * NO import statements — definitions are emitted verbatim.
 */

export interface VotingTrusteeKeyShare {
  TrusteePersonID: string;
  ShareIndex: number;
  Share: string;
}

export interface VotingCreateTrusteeKeysOutput {
  Success: boolean;
  Message?: string;
  PublicKey?: string;
  Shares?: VotingTrusteeKeyShare[];
}
