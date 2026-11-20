/**
 * Post-write cache refresh for the entities an administrative operation changes.
 *
 * MJ keeps RunView results in LocalCacheManager and maintains them from BaseEntity save events. For a save
 * outside a transaction that maintenance is fire-and-forget (it finishes after Save() has returned); for saves
 * inside an entity transaction it is deferred to the outermost commit. Either way a plain RunView issued right
 * after an operation returns can still be served the pre-write slot. Dropping the slots explicitly, once the
 * work is durable, makes the next read go to the database. Run it AFTER the commit, never before: invalidating
 * inside the transaction would let a concurrent reader re-cache the pre-commit rows.
 */

import { LocalCacheManager, LogError } from '@memberjunction/core';

/** Drops the cached RunView results of each entity. Never throws: a cache that cannot be cleared must not fail the operation. */
export async function RefreshCachedViews(entityNames: readonly string[]): Promise<void> {
    for (const entityName of entityNames) {
        try {
            await LocalCacheManager.Instance.InvalidateEntityCaches(entityName);
        } catch (e) {
            LogError(`Voting: could not refresh cached views of "${entityName}": ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}
