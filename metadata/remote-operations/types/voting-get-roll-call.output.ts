/**
 * Output for `Voting.GetRollCall`.
 *
 * NO import statements — definitions are emitted verbatim.
 */

export interface VotingRollCallSelection {
  OptionID: string;
  Rank?: number;
  WriteInText?: string;
}

export interface VotingRollCallEntry {
  EligibleVoterID: string;
  PersonID: string;
  SourceKey: string | null;
  VotingClass: string | null;
  Weight: number;
  HasVoted: boolean;
  Abstain: boolean;
  Selections: VotingRollCallSelection[];
  Channel?: 'Online' | 'Paper' | 'Proxy' | 'InPerson';
  EnteredByUserID?: string | null;
  CastAt?: string;
}

export interface VotingRollCallContest {
  ContestID: string;
  ContestName: string;
  Entries: VotingRollCallEntry[];
}

export interface VotingGetRollCallOutput {
  Success: boolean;
  Message?: string;
  ElectionID?: string;
  Status?: string;
  Contests?: VotingRollCallContest[];
}
