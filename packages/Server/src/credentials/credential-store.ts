/**
 * Persistence helpers for VoterCredential rows.
 */

import { type mjBizAppsVotingVoterCredentialEntity } from '@mj-biz-apps/voting-entities';
import { SqlLiteral, type VotingContext, RunViewOf } from '../shared/index.js';

export const VOTER_CREDENTIALS_ENTITY = 'MJ_BizApps_Voting: Voter Credentials';

/** Fields of a new credential. Secrets arrive already hashed. */
export interface NewCredential {
    EligibleVoterID: string;
    VoterCredentialMethodID: string;
    SecretHash?: string | null;
    ControlNumberHash?: string | null;
    ExpiresAt?: Date | null;
}

/** Inserts a credential row. Throws with the save message when it cannot. */
export async function InsertCredential(fields: NewCredential, ctx: VotingContext): Promise<mjBizAppsVotingVoterCredentialEntity> {
    const row = await ctx.Provider.GetEntityObject<mjBizAppsVotingVoterCredentialEntity>(VOTER_CREDENTIALS_ENTITY, ctx.ContextUser);
    row.NewRecord();
    row.EligibleVoterID = fields.EligibleVoterID;
    row.VoterCredentialMethodID = fields.VoterCredentialMethodID;
    row.SecretHash = fields.SecretHash ?? null;
    row.ControlNumberHash = fields.ControlNumberHash ?? null;
    row.IssuedAt = new Date();
    row.ExpiresAt = fields.ExpiresAt ?? null;
    row.FailedAttempts = 0;
    row.LockedUntil = null;
    if (!(await row.Save())) {
        throw new Error(`Could not save the voter credential: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
    return row;
}

/** Credentials of a voter for a method that are neither revoked nor redeemed, as mutable entities. */
export async function LoadLiveCredentials(
    eligibleVoterID: string,
    methodID: string,
    ctx: VotingContext
): Promise<mjBizAppsVotingVoterCredentialEntity[]> {
    const rv = RunViewOf(ctx);
    const result = await rv.RunView<mjBizAppsVotingVoterCredentialEntity>(
        {
            EntityName: VOTER_CREDENTIALS_ENTITY,
            ExtraFilter: `EligibleVoterID = ${SqlLiteral(eligibleVoterID)} AND VoterCredentialMethodID = ${SqlLiteral(methodID)} AND RevokedAt IS NULL AND RedeemedAt IS NULL`,
            OrderBy: 'IssuedAt DESC',
            ResultType: 'entity_object',
        },
        ctx.ContextUser
    );
    if (!result.Success) throw new Error(`Could not read voter credentials: ${result.ErrorMessage}`);
    return result.Results;
}

/** Revokes every live credential of a voter for a method. Returns how many were revoked. */
export async function RevokeLiveCredentials(eligibleVoterID: string, methodID: string, ctx: VotingContext): Promise<number> {
    const live = await LoadLiveCredentials(eligibleVoterID, methodID, ctx);
    let revoked = 0;
    for (const credential of live) {
        credential.RevokedAt = new Date();
        if (!(await credential.Save())) {
            throw new Error(`Could not revoke a voter credential: ${credential.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        revoked++;
    }
    return revoked;
}
