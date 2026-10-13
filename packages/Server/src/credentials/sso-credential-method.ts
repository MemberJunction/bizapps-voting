/**
 * SsoCredentialMethod: the voter signed in through an identity provider (WorkOS, Auth0...). The public edge validates the
 * IdP token with MJ's configured auth providers BEFORE calling here, so the presentation carries an already-validated
 * identity ({ Email, ExternalID }). This driver never sees or checks an IdP token. Matched to the roll by external id
 * (SourceKey) first, then by email.
 */

import { RegisterClass } from '@memberjunction/global';
import { type mjBizAppsVotingBallotDistributionEntity } from '@mj-biz-apps/voting-entities';
import { type EngineResult, type VotingContext } from '../shared/index.js';
import { BaseVoterCredentialMethod, InvalidCredential } from './base-voter-credential-method.js';
import { type VerifiedVoter, type VoterCredentialPresentation } from './credential-types.js';
import { VerifyAssertedIdentity } from './identity-match.js';

@RegisterClass(BaseVoterCredentialMethod, 'SsoCredentialMethod')
export class SsoCredentialMethod extends BaseVoterCredentialMethod {
    public async Verify(
        presentation: VoterCredentialPresentation,
        _distribution: mjBizAppsVotingBallotDistributionEntity,
        electionID: string,
        ctx: VotingContext
    ): Promise<EngineResult<VerifiedVoter>> {
        if (!presentation.ExternalID?.trim() && !presentation.Email?.trim()) return InvalidCredential<VerifiedVoter>();
        return VerifyAssertedIdentity({ SourceKey: presentation.ExternalID, Email: presentation.Email }, electionID, ctx);
    }
}
