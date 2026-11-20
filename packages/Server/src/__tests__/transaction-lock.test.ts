import { describe, expect, it, vi } from 'vitest';
import type { VotingContext } from '../shared/types.js';
import { AcquireTransactionLocks, TransactionLockStatement } from '../shared/transaction-lock.js';
import { RunningTallyLockResources } from '../engines/cast-engine.js';

function ctxWith(platform: string, result: number): { ctx: VotingContext; calls: Array<{ sql: string; params: unknown[] }> } {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const provider = {
        PlatformKey: platform,
        ExecuteSQL: vi.fn(async (sql: string, params: unknown[]) => {
            calls.push({ sql, params });
            return [{ Result: result }];
        }),
    };
    return { ctx: { ContextUser: {} as VotingContext['ContextUser'], Provider: provider as unknown as VotingContext['Provider'] }, calls };
}

describe('running-tally locks (lost-update guard for concurrent casts)', () => {
    it('one lock per contest, sorted and de-duplicated, whatever the option order', () => {
        const deltas = [
            { ContestID: 'C-2', OptionID: 'b', Delta: 1 },
            { ContestID: 'c-1', OptionID: 'a', Delta: 1 },
            { ContestID: 'C-2', OptionID: null, Delta: 1 },
        ];
        expect(RunningTallyLockResources(deltas)).toEqual(['voting-running-tally:c-1', 'voting-running-tally:c-2']);
    });

    it('takes every lock inside the ambient transaction (sp_getapplock, transaction owner) in sorted order', async () => {
        const { ctx, calls } = ctxWith('sqlserver', 0);
        await AcquireTransactionLocks(ctx, ['b', 'A', 'a']);
        expect(calls.map((c) => c.params)).toEqual([['a'], ['b']]);
        expect(calls[0].sql).toContain('sp_getapplock');
        expect(calls[0].sql).toContain("@LockOwner = 'Transaction'");
        expect(calls[0].sql).toContain("@LockMode = 'Exclusive'");
    });

    it('accepts a lock granted after waiting (1) and refuses a timeout or deadlock (negative)', async () => {
        await expect(AcquireTransactionLocks(ctxWith('sqlserver', 1).ctx, ['x'])).resolves.toBeUndefined();
        await expect(AcquireTransactionLocks(ctxWith('sqlserver', -1).ctx, ['x'])).rejects.toThrow(/not granted/);
        await expect(AcquireTransactionLocks(ctxWith('sqlserver', -3).ctx, ['x'])).rejects.toThrow(/not granted/);
    });

    it('uses a transaction-scoped advisory lock on PostgreSQL', () => {
        expect(TransactionLockStatement('postgresql').SQL).toContain('pg_advisory_xact_lock');
    });

    it('refuses rather than counting unguarded when the provider cannot run SQL', async () => {
        const ctx = { ContextUser: {} as VotingContext['ContextUser'], Provider: {} as VotingContext['Provider'] };
        await expect(AcquireTransactionLocks(ctx, ['x'])).rejects.toThrow(/cannot take transaction locks/);
    });

    it('does nothing for an empty set', async () => {
        const { ctx, calls } = ctxWith('sqlserver', 0);
        await AcquireTransactionLocks(ctx, []);
        expect(calls).toHaveLength(0);
    });
});
