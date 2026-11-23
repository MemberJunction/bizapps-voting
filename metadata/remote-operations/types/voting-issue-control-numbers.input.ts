/**
 * Input for `Voting.IssueControlNumbers`.
 *
 * NO import statements — definitions are emitted verbatim.
 */

export interface VotingIssueControlNumbersInput {
  /** The election the control numbers are for. */
  ElectionID: string;
  /** Voters to issue to; if omitted, every Eligible voter on the roll. */
  EligibleVoterIDs?: string[];
  /** Credential method the numbers are filed under (default 'emailed-link'). */
  MethodCode?: string;
}
