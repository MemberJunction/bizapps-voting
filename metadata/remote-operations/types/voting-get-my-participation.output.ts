/**
 * Output for `Voting.GetMyParticipation`.
 *
 * NO import statements — definitions are emitted verbatim.
 */

export type VotingParticipationChannel = 'Online' | 'Paper' | 'Proxy' | 'InPerson';

export interface VotingGetMyParticipationOutput {
  Success: boolean;
  Message?: string;
  HasVoted?: boolean;
  Channel?: VotingParticipationChannel;
}
