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
