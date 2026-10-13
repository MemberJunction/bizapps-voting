/**
 * Output for `Voting.GetResults`.
 *
 * NO import statements — definitions are emitted verbatim.
 */

export type VotingTallyContestOutcome = 'Passed' | 'Failed' | 'Decided' | 'Tied' | 'Void';
export type VotingTallyOptionOutcome = 'Elected' | 'Defeated' | 'Excluded' | 'Tied' | 'Counted';

export interface VotingTallyRound {
  Round: number;
  Tallies: Record<string, number>;
  Elected: string[];
  Excluded: string[];
  Transfers?: Record<string, number>;
  Exhausted?: number;
  Note?: string;
}

export interface VotingTallyOptionResult {
  OptionID: string;
  Votes: number;
  Position: number;
  Outcome: VotingTallyOptionOutcome;
}

export interface VotingContestOutcome {
  ContestID: string;
  Outcome: VotingTallyContestOutcome;
  VotesCast: number;
  Abstentions: number;
  Options: VotingTallyOptionResult[];
  Rounds?: VotingTallyRound[];
  TieBroken?: boolean;
  Notes?: string[];
}

export interface VotingGetResultsOutput {
  Success: boolean;
  Message?: string;
  Visible?: boolean;
  Reason?: string;
  IsFinal?: boolean;
  IsRunning?: boolean;
  SnapshotAt?: string;
  BallotCount?: number;
  Contests?: VotingContestOutcome[];
}
