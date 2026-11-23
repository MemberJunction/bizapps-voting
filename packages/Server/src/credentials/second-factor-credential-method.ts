/**
 * SecondFactorCredentialMethod: a roster identifier (SourceKey) plus a PIN. The PIN is stored only as
 * `scrypt$<salt>$<hash>` in VoterCredential.SecretHash (per-credential salt). Wrong PINs are counted DURABLY on the
 * credential (FailedAttempts / LockedUntil), so the lockout survives restarts and holds across API instances.
 * MaxFailedAttempts and LockoutMinutes come from the method's Configuration.
 */

import { RegisterClass } from '@memberjunction/global';
import {
    type mjBizAppsVotingBallotDistributionEntity,
    type mjBizAppsVotingVoterCredentialEntity,
    type mjBizAppsVotingVoterCredentialMethodEntity,
} from '@mj-biz-apps/voting-entities';
import { type EngineResult, Fail, Ok, SqlLiteral, type VotingContext, RunViewOf } from '../shared/index.js';
import { ParseJsonObject } from '../eligibility/json-settings.js';
import { BaseVoterCredentialMethod, InvalidCredential } from './base-voter-credential-method.js';
import { BurnPinCheck, IsLockedOut, ParseLockoutPolicy, RegisterFailedAttempt, VerifyPin } from './credential-crypto.js';
import { VOTER_CREDENTIALS_ENTITY } from './credential-store.js';
import { type VerifiedVoter, type VoterCredentialPresentation } from './credential-types.js';
import { WithKeyedLock } from './keyed-lock.js';
import { CreateRollFinders } from './roll-lookup.js';

const MAX_PIN_LENGTH = 64;

@RegisterClass(BaseVoterCredentialMethod, 'SecondFactorCredentialMethod')
export class SecondFactorCredentialMethod extends BaseVoterCredentialMethod {
    public async Verify(
        presentation: VoterCredentialPresentation,
        _distribution: mjBizAppsVotingBallotDistributionEntity,
        electionID: string,
        ctx: VotingContext,
        method: mjBizAppsVotingVoterCredentialMethodEntity
    ): Promise<EngineResult<VerifiedVoter>> {
        const sourceKey = (presentation.SecondFactor?.SourceKey ?? presentation.SourceKey)?.trim();
        const pin = presentation.SecondFactor?.Pin ?? presentation.Pin;
        if (!sourceKey || !pin || pin.length > MAX_PIN_LENGTH) return InvalidCredential<VerifiedVoter>();

        const voterIDs = await CreateRollFinders(electionID, ctx).BySourceKey(sourceKey);
        if (voterIDs.length !== 1) {
            await BurnPinCheck(pin); // same cost whether or not the key exists
            return InvalidCredential<VerifiedVoter>();
        }
        const eligibleVoterID = voterIDs[0];

        const rv = RunViewOf(ctx);
        const found = await rv.RunView<mjBizAppsVotingVoterCredentialEntity>(
            {
                EntityName: VOTER_CREDENTIALS_ENTITY,
                ExtraFilter: `EligibleVoterID = ${SqlLiteral(eligibleVoterID)} AND VoterCredentialMethodID = ${SqlLiteral(method.ID)} AND RevokedAt IS NULL`,
                OrderBy: 'IssuedAt DESC',
                MaxRows: 1,
                ResultType: 'entity_object',
            },
            ctx.ContextUser
        );
        if (!found.Success || found.Results.length === 0) {
            await BurnPinCheck(pin);
            return InvalidCredential<VerifiedVoter>();
        }
        const credentialID = found.Results[0].ID;
        const policy = ParseLockoutPolicy(ParseJsonObject(method.Configuration));

        return WithKeyedLock(`cred:${credentialID.toLowerCase()}`, async () => {
            // Reload inside the lock so the attempt count is current.
            const credential = await ctx.Provider.GetEntityObject<mjBizAppsVotingVoterCredentialEntity>(VOTER_CREDENTIALS_ENTITY, ctx.ContextUser);
            if (!(await credential.Load(credentialID))) return InvalidCredential<VerifiedVoter>();
            const now = new Date();
            if (credential.ExpiresAt && credential.ExpiresAt.getTime() <= now.getTime()) return InvalidCredential<VerifiedVoter>();
            if (IsLockedOut({ FailedAttempts: credential.FailedAttempts, LockedUntil: credential.LockedUntil }, now)) {
                return Fail<VerifiedVoter>('CredentialLocked', 'Too many failed attempts. Try again later.');
            }

            if (await VerifyPin(pin, credential.SecretHash)) {
                if (credential.FailedAttempts !== 0 || credential.LockedUntil) {
                    credential.FailedAttempts = 0;
                    credential.LockedUntil = null;
                    await credential.Save();
                }
                return Ok({ EligibleVoterID: eligibleVoterID });
            }

            const next = RegisterFailedAttempt({ FailedAttempts: credential.FailedAttempts, LockedUntil: credential.LockedUntil }, policy, now);
            credential.FailedAttempts = next.FailedAttempts;
            credential.LockedUntil = next.LockedUntil;
            if (!(await credential.Save())) {
                // The count could not be recorded: fail closed rather than allow unlimited guessing.
                return Fail<VerifiedVoter>('CredentialLocked', 'Too many failed attempts. Try again later.');
            }
            return next.LockedUntil
                ? Fail<VerifiedVoter>('CredentialLocked', 'Too many failed attempts. Try again later.')
                : InvalidCredential<VerifiedVoter>();
        });
    }
}
