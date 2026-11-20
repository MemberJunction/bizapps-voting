/**
 * Output for `Voting.IssueSecondFactorPins`.
 *
 * NO import statements — definitions are emitted verbatim.
 */

export interface VotingIssuedSecondFactorPin {
  EligibleVoterID: string;
  /** The roster key the voter presents together with the PIN. */
  SourceKey: string | null;
  /** The plain PIN. Returned once; only a salted scrypt hash is stored. */
  Pin: string;
}

export interface VotingIssueSecondFactorPinsOutput {
  Success: boolean;
  Message?: string;
  Issued?: VotingIssuedSecondFactorPin[];
  /** Requested voters that received no PIN (no roster key, not on the roll, or not Eligible). */
  Skipped?: number;
}
