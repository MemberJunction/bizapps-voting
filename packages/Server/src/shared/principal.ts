/**
 * Whether a user is a scope-limited (guest) principal. Mirrors MJServer's `IsScopeLimitedPrincipal`
 * (a missing user, an anonymous magic-link session, or a populated MagicLinkScope all count as limited).
 *
 * It is restated here, not imported, because `@memberjunction/server`'s entry point loads the whole API server
 * configuration at import time, which makes every engine unit test (and any non-server consumer) fail to load.
 * Keep it identical to MJServer's `auth/scopeLimitedPrincipal.ts`.
 */

import { type UserInfo } from '@memberjunction/core';

export function IsGuestPrincipal(user: UserInfo | undefined | null): boolean {
    if (!user) return true;
    if (user.IsMagicLinkAnonymous) return true;
    const scope = user.MagicLinkScope;
    return !!(scope?.ResourceID || scope?.ResourceType);
}

/** A guest scope's parts. */
export interface GuestScope {
    ElectionID: string;
    EligibleVoterID: string;
}

/** Parses a guest session resource id (`electionId:eligibleVoterId`). Null when it is not that shape. */
export function ParseGuestResource(resourceID: string | undefined | null): GuestScope | null {
    if (!resourceID) return null;
    const idx = resourceID.indexOf(':');
    if (idx <= 0 || idx === resourceID.length - 1 || resourceID.indexOf(':', idx + 1) !== -1) return null;
    const electionID = resourceID.slice(0, idx).trim();
    const voterID = resourceID.slice(idx + 1).trim();
    return electionID && voterID ? { ElectionID: electionID, EligibleVoterID: voterID } : null;
}
