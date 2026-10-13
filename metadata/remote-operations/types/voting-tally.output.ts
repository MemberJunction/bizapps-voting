/**
 * Output for `Voting.Tally`.
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

export interface VotingContestTallyResult {
  ContestID: string;
  Outcome: VotingTallyContestOutcome;
  VotesCast: number;
  Abstentions: number;
  Options: VotingTallyOptionResult[];
  Rounds?: VotingTallyRound[];
  TieBroken?: boolean;
  Notes?: string[];
}

export interface VotingTallyOutput {
  Success: boolean;
  Message?: string;
  Status?: string;
  Contests?: VotingContestTallyResult[];
}
