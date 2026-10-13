/**
 * The system user: the only identity that writes the ballot box, so a ballot row never carries the voter's identity
 * (design section 4.2, "Acting user").
 */

import { type UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { type VotingContext } from './types.js';

/** The MJ system user. Throws when the user cache holds none (a deployment without the system user cannot cast ballots safely). */
export function GetSystemUser(): UserInfo {
    const user = UserCache.Instance.GetSystemUser();
    if (!user) {
        throw new Error('The MJ system user is not available; ballot-box writes are refused.');
    }
    return user;
}

/** Same provider, system user. For ballot-box reads and writes ONLY. */
export function SystemContext(ctx: VotingContext): VotingContext {
    return { ContextUser: GetSystemUser(), Provider: ctx.Provider };
}
