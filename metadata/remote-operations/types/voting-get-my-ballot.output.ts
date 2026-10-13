/**
 * Output for `Voting.GetMyBallot`.
 *
 * NO import statements — definitions are emitted verbatim.
 */

export type VotingSecrecyMode = 'Open' | 'Confidential' | 'Secret';
export type VotingContestKind = 'Motion' | 'Office' | 'Question' | 'Amendment' | 'StandardsItem';

export interface VotingBallotStyleOption {
  OptionID: string;
  Label: string;
  Description?: string;
  PhotoUrl?: string;
  StatementUrl?: string;
  IsWriteIn: boolean;
}

export interface VotingBallotStyleContest {
  ContestID: string;
  Name: string;
  Description?: string;
  Kind: VotingContestKind;
  Seats: number;
  IsRanked: boolean;
  AllowAbstain: boolean;
  AllowWriteIn: boolean;
  MinSelections: number;
  MaxSelections: number;
  RequireCommentOnOptionIDs?: string[];
  Options: VotingBallotStyleOption[];
}

export interface VotingBallotStyle {
  ElectionID: string;
  ElectionName: string;
  Description?: string;
  ClosesAt?: string;
  SecrecyMode: VotingSecrecyMode;
  AllowRevote: boolean;
  Language: string;
  Contests: VotingBallotStyleContest[];
  Hash: string;
}

export interface VotingGetMyBallotOutput {
  Success: boolean;
  Message?: string;
  Style?: VotingBallotStyle;
  HasVoted?: boolean;
  CanRevote?: boolean;
  ReceiptCode?: string | null;
}
