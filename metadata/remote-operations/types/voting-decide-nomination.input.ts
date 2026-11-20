/**
 * Input for `Voting.DecideNomination`.
 *
 * NO import statements — definitions are emitted verbatim.
 */

export interface VotingDecideNominationInput {
  /** The nomination to decide. */
  NominationID: string;
  /** Approval decision: Approved or Rejected. */
  Decision: 'Approved' | 'Rejected';
  /** Optional notes. */
  Notes?: string;
}
