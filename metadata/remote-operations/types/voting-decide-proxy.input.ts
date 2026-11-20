/**
 * Input for `Voting.DecideProxy`.
 *
 * NO import statements — definitions are emitted verbatim.
 */

export interface VotingDecideProxyInput {
  /** The proxy designation to decide. */
  ProxyDesignationID: string;
  /** Accept or reject the designation. */
  Decision: 'Accepted' | 'Rejected';
  /** Optional notes, recorded in the election audit trail. */
  Notes?: string;
}
