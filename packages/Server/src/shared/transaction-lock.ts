/**
 * Exclusive, transaction-scoped named locks: the one place Voting issues SQL that is not an entity save.
 *
 * Why: a read-modify-write of a shared counter row (the running tally of a contest option) through BaseEntity is a lost
 * update under concurrency. Two casts read the same VoteCount, each saves VoteCount + 1, and one increment vanishes; two
 * first casts of an option both insert the row and one fails the unique key. BaseEntity has no atomic increment and no
 * row-version check, so the increments of one contest are serialized instead: each cast transaction takes a named lock
 * per contest it counts in, held until that transaction commits or rolls back, then reads the row fresh and saves it.
 *
 * The lock writes nothing; it only serializes writers. It must run INSIDE the caller's entity transaction (it joins the
 * provider's ambient transaction), or it would be released immediately.
 */

import { type DatabasePlatform, type ExecuteSQLOptions, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { type VotingContext } from './types.js';

/**
 * The named lock that serializes everything that writes or freezes an election's results: the tally (first or re-tally)
 * and each certification signature. Taken inside their transactions (AcquireTransactionLocks).
 */
export function ResultsLockResource(electionID: string): string {
    return `voting:results:${electionID.toLowerCase()}`;
}

/** How long a cast waits for another cast of the same contest before giving up. */
export const TRANSACTION_LOCK_TIMEOUT_MS = 30_000;

interface SqlExecutingProvider {
    PlatformKey: DatabasePlatform;
    ExecuteSQL<T>(query: string, parameters?: unknown[], options?: ExecuteSQLOptions, contextUser?: UserInfo): Promise<Array<T>>;
}

function canExecuteSql(p: IMetadataProvider): p is IMetadataProvider & SqlExecutingProvider {
    const candidate = p as Partial<SqlExecutingProvider>;
    return typeof candidate.ExecuteSQL === 'function' && typeof candidate.PlatformKey === 'string';
}

/** The lock statement for a platform, with the resource name as its only parameter, and how to read its result. */
export function TransactionLockStatement(platform: DatabasePlatform): { SQL: string; Acquired: (rows: ReadonlyArray<{ Result?: number | null }>) => boolean } {
    if (platform === 'postgresql') {
        // Waits until granted (bounded by the transaction's statement timeout); released at commit/rollback.
        return { SQL: 'SELECT 0 AS "Result" FROM (SELECT pg_advisory_xact_lock(hashtextextended($1, 0))) AS l', Acquired: () => true };
    }
    // sp_getapplock returns 0 (granted) or 1 (granted after waiting); negative values are timeout, cancel, deadlock or error.
    return {
        SQL: `DECLARE @r INT; EXEC @r = sp_getapplock @Resource = @p0, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = ${TRANSACTION_LOCK_TIMEOUT_MS}; SELECT @r AS Result;`,
        Acquired: (rows) => typeof rows[0]?.Result === 'number' && (rows[0].Result as number) >= 0,
    };
}

/**
 * Takes the exclusive transaction-scoped locks named by `resources`, in sorted order (so two transactions that need the
 * same set never deadlock on each other). Throws when the provider cannot run SQL or a lock is not granted; the caller's
 * transaction then rolls back and nothing was counted.
 */
export async function AcquireTransactionLocks(ctx: VotingContext, resources: readonly string[]): Promise<void> {
    if (resources.length === 0) return;
    const provider = ctx.Provider;
    if (!canExecuteSql(provider)) throw new Error('This provider cannot take transaction locks.');
    const statement = TransactionLockStatement(provider.PlatformKey);
    const ordered = [...new Set(resources.map((r) => r.toLowerCase()))].sort();
    for (const resource of ordered) {
        const rows = await provider.ExecuteSQL<{ Result?: number | null }>(statement.SQL, [resource], { description: 'Voting: transaction lock', ignoreLogging: true }, ctx.ContextUser);
        if (!statement.Acquired(rows ?? [])) throw new Error(`Lock "${resource}" was not granted.`);
    }
}
