/**
 * Input for `Voting.UpdateElection`.
 *
 * NO import statements — definitions are emitted verbatim.
 */

export type VotingSecrecyMode = 'Open' | 'Confidential' | 'Secret';
export type VotingAssuranceTier = 'Standard' | 'HighAssurance' | 'Verifiable';
export type VotingResultsTiming = 'AfterClose' | 'AfterVoting' | 'Live' | 'AdministratorsOnly';
export type VotingResultsAudience = 'Voters' | 'Eligible' | 'HostMembers' | 'Public' | 'Administrators';

export interface VotingUpdateElectionInput {
  ElectionID: string;
  Name?: string;
  Description?: string;
  SecrecyMode?: VotingSecrecyMode;
  AssuranceTier?: VotingAssuranceTier;
  ResultsTiming?: VotingResultsTiming;
  ResultsAudience?: VotingResultsAudience;
  OpensAt?: string;
  ClosesAt?: string;
  TimeZone?: string;
  Configuration?: Record<string, unknown>;
}
