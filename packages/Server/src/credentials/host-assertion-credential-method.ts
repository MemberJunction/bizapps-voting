/**
 * HostAssertionCredentialMethod: the organization's portal, where the voter is already signed in, signs a short-lived
 * RS256 assertion (audience = the distribution's key). It is verified against BallotDistribution.HostPublicKey, which an
 * administrator registered out of band: the presenter never supplies the key. The assertion is matched to the roll by
 * the host's user id (SourceKey) first, then by email.
 */

import { RegisterClass } from '@memberjunction/global';
import { VerifyHostAssertion } from '@memberjunction/server';
import { type mjBizAppsVotingBallotDistributionEntity } from '@mj-biz-apps/voting-entities';
import { type EngineResult, type VotingContext } from '../shared/index.js';
import { BaseVoterCredentialMethod, InvalidCredential } from './base-voter-credential-method.js';
import { type VerifiedVoter, type VoterCredentialPresentation } from './credential-types.js';
import { VerifyAssertedIdentity } from './identity-match.js';

@RegisterClass(BaseVoterCredentialMethod, 'HostAssertionCredentialMethod')
export class HostAssertionCredentialMethod extends BaseVoterCredentialMethod {
    public async Verify(
        presentation: VoterCredentialPresentation,
        distribution: mjBizAppsVotingBallotDistributionEntity,
        electionID: string,
        ctx: VotingContext
    ): Promise<EngineResult<VerifiedVoter>> {
        if (!presentation.Assertion || !distribution.HostPublicKey?.trim()) return InvalidCredential<VerifiedVoter>();
        const verified = VerifyHostAssertion(presentation.Assertion, distribution.HostPublicKey, distribution.DistributionKey);
        if (!verified.ok || !verified.Identity) return InvalidCredential<VerifiedVoter>();
        return VerifyAssertedIdentity({ SourceKey: verified.Identity.hostUserId, Email: verified.Identity.email }, electionID, ctx);
    }
}
