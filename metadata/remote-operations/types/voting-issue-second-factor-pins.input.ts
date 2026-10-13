/**
 * Input for `Voting.IssueSecondFactorPins`.
 *
 * NO import statements — definitions are emitted verbatim.
 */

export interface VotingIssueSecondFactorPinsInput {
  /** The election the PINs are for. */
  ElectionID: string;
  /** Voters to issue to; if omitted, every Eligible voter on the roll. */
  EligibleVoterIDs?: string[];
}
