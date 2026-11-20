/**
 * Output for `Voting.IssueControlNumbers`.
 *
 * NO import statements — definitions are emitted verbatim.
 */

export interface VotingIssuedControlNumber {
  EligibleVoterID: string;
  /** The plain control number. Returned once; only its SHA-256 is stored. */
  ControlNumber: string;
}

export interface VotingIssueControlNumbersOutput {
  Success: boolean;
  Message?: string;
  Issued?: VotingIssuedControlNumber[];
  /** Requested voters that received no number (not on the roll, or not Eligible). */
  Skipped?: number;
}
