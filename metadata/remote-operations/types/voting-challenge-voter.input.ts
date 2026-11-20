/**
 * Input for `Voting.ChallengeVoter`.
 *
 * NO import statements — definitions are emitted verbatim.
 */

export interface VotingChallengeVoterInput {
  /** The eligible voter being challenged. */
  EligibleVoterID: string;
  /** The reason for the challenge. */
  Reason: string;
  /** Optional immediate decision: Uphold (remove), Reject (keep eligible). */
  Decision?: 'Uphold' | 'Reject';
}
