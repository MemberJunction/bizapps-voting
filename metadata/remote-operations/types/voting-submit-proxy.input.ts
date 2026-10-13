/**
 * Input for `Voting.SubmitProxy`.
 *
 * NO import statements — definitions are emitted verbatim.
 */

export interface VotingSubmitProxyInput {
  /** The election in which to designate a proxy. */
  ElectionID: string;
  /** The PersonID of the eligible voter to act as proxy. */
  ProxyPersonID: string;
  /** Optional scope limiting the proxy's voting (e.g., voting class filter). */
  Scope?: string;
  /** Optional instructions to the proxy (e.g., voting direction). */
  Instructions?: string;
}
