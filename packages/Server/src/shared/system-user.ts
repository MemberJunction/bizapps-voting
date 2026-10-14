/**
 * The system user: the only identity that writes the ballot box, so a ballot row never carries the voter's identity
 * (design section 4.2, "Acting user").
 */

import { type UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { UserCache } from '@memberjunction/generic-database-provider';
import { IsGuestPrincipal, ParseGuestResource } from './principal.js';
import { type VotingActor, type VotingContext } from './types.js';

/** The MJ system user. Throws when the user cache holds none (a deployment without the system user cannot cast ballots safely). */
export function GetSystemUser(): UserInfo {
    const user = UserCache.Instance.GetSystemUser();
    if (!user) {
        throw new Error('The MJ system user is not available; ballot-box writes are refused.');
    }
    return user;
}

/**
 * Who `user` is for audit attribution: the MJ user, or for a guest ballot session the roll entry its signed scope names.
 * Undefined for the system user itself (and for a guest with no ballot scope), which audits as no actor.
 */
export function ActorOf(user: UserInfo | undefined | null, systemUserID?: string): VotingActor | undefined {
    if (!user) return undefined;
    if (IsGuestPrincipal(user)) {
        const scope = ParseGuestResource(user.MagicLinkScope?.ResourceID);
        return scope ? { GuestEligibleVoterID: scope.EligibleVoterID } : undefined;
    }
    if (!user.ID || (systemUserID && UUIDsEqual(systemUserID, user.ID))) return undefined;
    return { UserID: user.ID };
}

/**
 * Same provider, system user. For ballot-box reads and writes, and for voter operations after the caller was authorized.
 * The caller is kept as the context's `Actor` (audit attribution only); a context that already carries one keeps it.
 */
export function SystemContext(ctx: VotingContext): VotingContext {
    const system = GetSystemUser();
    const actor = ctx.Actor ?? ActorOf(ctx.ContextUser, system.ID);
    return actor ? { ContextUser: system, Provider: ctx.Provider, Actor: actor } : { ContextUser: system, Provider: ctx.Provider };
}
