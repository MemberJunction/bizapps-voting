/**
 * Input for `Voting.IssueCredentials`.
 *
 * NO import statements — definitions are emitted verbatim.
 */

export interface VotingIssueCredentialsInput {
  /** The election for which to issue credentials. */
  ElectionID: string;
  /** The credential method code (e.g., 'emailed-link', 'host-assertion'). */
  MethodCode: string;
  /** Optional list of EligibleVoterIDs to issue to; if omitted, all non-challenged eligible voters. */
  EligibleVoterIDs?: string[];
  /** Optional base URL for magic link credentials. */
  BaseUrl?: string;
}
