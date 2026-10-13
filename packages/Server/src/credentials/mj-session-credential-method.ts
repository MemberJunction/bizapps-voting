/**
 * MjSessionCredentialMethod: the voter is already signed in to Explorer or Collaboration. There is no guest mint; the
 * context user is a normal MJ user matched to the roll through their Person record (VoterIdentityResolver).
 */

import { RegisterClass } from '@memberjunction/global';
import { type mjBizAppsVotingBallotDistributionEntity } from '@mj-biz-apps/voting-entities';
import { type EngineResult, Ok, VoterIdentityResolver, type VotingContext } from '../shared/index.js';
import { BaseVoterCredentialMethod, InvalidCredential } from './base-voter-credential-method.js';
import { type VerifiedVoter, type VoterCredentialPresentation } from './credential-types.js';

@RegisterClass(BaseVoterCredentialMethod, 'MjSessionCredentialMethod')
export class MjSessionCredentialMethod extends BaseVoterCredentialMethod {
    public async Verify(
        _presentation: VoterCredentialPresentation,
        _distribution: mjBizAppsVotingBallotDistributionEntity,
        electionID: string,
        ctx: VotingContext
    ): Promise<EngineResult<VerifiedVoter>> {
        const identity = await VoterIdentityResolver.Resolve(electionID, ctx);
        // A guest ballot session is not an MJ session: only a real user qualifies for this method.
        if (!identity || identity.Via !== 'MJSession') return InvalidCredential<VerifiedVoter>();
        return Ok({ EligibleVoterID: identity.EligibleVoterID });
    }
}
