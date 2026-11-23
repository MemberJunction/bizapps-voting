/**
 * Input for `Voting.AmendRoll`.
 *
 * NO import statements — definitions are emitted verbatim.
 */

export interface VotingRollAddition {
  PersonID: string;
  VotingClass?: string;
  Weight?: number;
  SourceKey?: string;
  RepresentingOrganizationID?: string;
}

export interface VotingRollRemoval {
  EligibleVoterID: string;
  Reason: string;
}

export interface VotingAmendRollInput {
  /** The election whose roll to amend. */
  ElectionID: string;
  /** Voters to add to the roll. */
  Add?: VotingRollAddition[];
  /** Voters to remove from the roll, with reason. */
  Remove?: VotingRollRemoval[];
}
