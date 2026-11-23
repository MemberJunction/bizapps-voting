/**
 * BaseVoterCredentialMethod: the plug-in point that turns something a voter presents into a roll entry.
 * Resolved through ClassFactory by VoterCredentialMethod.DriverClass. Drivers hold no state.
 */

import { type mjBizAppsVotingBallotDistributionEntity, type mjBizAppsVotingVoterCredentialMethodEntity } from '@mj-biz-apps/voting-entities';
import { type EngineResult, Fail, type VotingContext } from '../shared/index.js';
import {
    type CredentialIssueOptions,
    type CredentialIssueResult,
    type CredentialIssueTarget,
    type VerifiedVoter,
    type VoterCredentialPresentation,
} from './credential-types.js';

/** The one failure message for "this did not verify". It never says which part was wrong. */
export function InvalidCredential<T>(): EngineResult<T> {
    return Fail<T>('InvalidCredential', 'The credential could not be verified.');
}

export abstract class BaseVoterCredentialMethod {
    /**
     * Verifies a presentation and names the roll entry. Must not reveal why a failure failed beyond the result code,
     * and must never log the presentation.
     * @param method the method row (its Configuration carries per-method settings)
     */
    public abstract Verify(
        presentation: VoterCredentialPresentation,
        distribution: mjBizAppsVotingBallotDistributionEntity,
        electionID: string,
        ctx: VotingContext,
        method: mjBizAppsVotingVoterCredentialMethodEntity
    ): Promise<EngineResult<VerifiedVoter>>;

    /** Issues one credential. Methods that need no issuance keep this default. */
    public async Issue(_target: CredentialIssueTarget, _options: CredentialIssueOptions, _ctx: VotingContext): Promise<CredentialIssueResult> {
        return { Status: 'Skipped', Reason: 'MethodDoesNotIssue' };
    }
}
