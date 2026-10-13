/**
 * Output for `Voting.GetTurnout`.
 *
 * NO import statements — definitions are emitted verbatim.
 */

export interface VotingGetTurnoutOutput {
  Success: boolean;
  Message?: string;
  Eligible?: number;
  Voted?: number;
  TurnoutPercent?: number;
  QuorumMet?: boolean;
  ByChannel?: Record<string, number>;
  ByMethod?: Record<string, number>;
}
