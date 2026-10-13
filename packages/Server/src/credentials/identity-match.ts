/**
 * Shared by the assertion-style methods (host assertion, SSO): match an asserted identity to one roll entry.
 */

import { type EngineResult, Ok, type VotingContext } from '../shared/index.js';
import { InvalidCredential } from './base-voter-credential-method.js';
import { MatchRollEntry } from './credential-crypto.js';
import { type VerifiedVoter } from './credential-types.js';
import { CreateRollFinders } from './roll-lookup.js';

/** SourceKey first, then email. Not on the roll, or ambiguous, gives the generic failure. */
export async function VerifyAssertedIdentity(
    identity: { SourceKey?: string | null; Email?: string | null },
    electionID: string,
    ctx: VotingContext
): Promise<EngineResult<VerifiedVoter>> {
    const match = await MatchRollEntry(identity, CreateRollFinders(electionID, ctx));
    return match.Kind === 'Matched' ? Ok({ EligibleVoterID: match.EligibleVoterID }) : InvalidCredential<VerifiedVoter>();
}
