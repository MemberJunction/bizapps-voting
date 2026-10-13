/**
 * Input for `Voting.CreateElection`.
 *
 * NO import statements — definitions are emitted verbatim.
 */

export type VotingSecrecyMode = 'Open' | 'Confidential' | 'Secret';
export type VotingAssuranceTier = 'Standard' | 'HighAssurance' | 'Verifiable';
export type VotingContestKind = 'Motion' | 'Office' | 'Question' | 'Amendment' | 'StandardsItem';
export type VotingThresholdKind = 'None' | 'Majority' | 'ThreeFifths' | 'TwoThirds' | 'ThreeQuarters' | 'Unanimous' | 'Custom';
export type VotingThresholdBasis = 'VotesCast' | 'Eligible';
export type VotingResultsTiming = 'AfterClose' | 'AfterVoting' | 'Live' | 'AdministratorsOnly';
export type VotingResultsAudience = 'Voters' | 'Eligible' | 'HostMembers' | 'Public' | 'Administrators';

export interface VotingContestOption {
  Label: string;
  Description?: string;
  CandidatePersonID?: string;
  IsWriteIn?: boolean;
}

export interface VotingContestSpec {
  Name: string;
  Description?: string;
  Kind: VotingContestKind;
  Seats?: number;
  TallyMethodCode: string;
  Threshold?: VotingThresholdKind;
  CustomThreshold?: number;
  ThresholdBasis?: VotingThresholdBasis;
  AllowAbstain?: boolean;
  AllowWriteIn?: boolean;
  MinSelections?: number;
  MaxSelections?: number;
  VotingClassFilter?: string;
  Options?: VotingContestOption[];
}

export interface VotingEligibilitySource {
  Code: string;
  Settings?: Record<string, unknown>;
}

export interface VotingAnchor {
  EntityName: string;
  RecordID: string;
  Role?: string;
  IsPrimary?: boolean;
}

export interface VotingCreateElectionInput {
  ElectionTypeCode: string;
  Name: string;
  Description?: string;
  Anchors?: VotingAnchor[];
  EligibilitySource: VotingEligibilitySource;
  Contests: VotingContestSpec[];
  SecrecyMode?: VotingSecrecyMode;
  AssuranceTier?: VotingAssuranceTier;
  ResultsTiming?: VotingResultsTiming;
  ResultsAudience?: VotingResultsAudience;
  RecordDate?: string;
  OpensAt?: string;
  ClosesAt?: string;
  TimeZone?: string;
  Configuration?: Record<string, unknown>;
}
