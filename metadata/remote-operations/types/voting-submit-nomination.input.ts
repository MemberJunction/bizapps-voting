/**
 * Input for `Voting.SubmitNomination`.
 *
 * NO import statements — definitions are emitted verbatim.
 */

export interface VotingSubmitNominationInput {
  /** The contest being nominated for. */
  ContestID: string;
  /** The PersonID of the nominee. */
  NomineePersonID: string;
  /** Optional candidate statement. */
  Statement?: string;
}
