/**
 * Tests for BallotBoxWriteGuard, TallyWriteGuard, and ServerOperationScopeManager integration
 */

import { describe, it, expect } from 'vitest';
import { ServerOperationScopeManager } from '@memberjunction/core';
import {
    BALLOT_BOX_ALLOWED_OPERATIONS,
    BALLOT_BOX_OPERATION_KEY,
    BallotBoxWriteGuard,
    TALLY_ALLOWED_OPERATIONS,
    TALLY_OPERATION_KEY,
    TallyWriteGuard,
} from '../write-guards.js';

describe('BallotBoxWriteGuard', () => {
    it('has no access outside RunWithBallotBoxAccess', () => {
        expect(BallotBoxWriteGuard.HasBallotBoxAccess()).toBe(false);
    });

    it('has access inside RunWithBallotBoxAccess', async () => {
        let insideAccess = false;
        await BallotBoxWriteGuard.RunWithBallotBoxAccess(async () => {
            insideAccess = BallotBoxWriteGuard.HasBallotBoxAccess();
        });
        expect(insideAccess).toBe(true);
    });

    it('loses access after RunWithBallotBoxAccess completes', async () => {
        await BallotBoxWriteGuard.RunWithBallotBoxAccess(async () => {
            // inside
        });
        expect(BallotBoxWriteGuard.HasBallotBoxAccess()).toBe(false);
    });

    it('supports nested scopes with isolation', async () => {
        const results: boolean[] = [];

        await BallotBoxWriteGuard.RunWithBallotBoxAccess(async () => {
            results.push(BallotBoxWriteGuard.HasBallotBoxAccess()); // true

            // Nested call
            await BallotBoxWriteGuard.RunWithBallotBoxAccess(async () => {
                results.push(BallotBoxWriteGuard.HasBallotBoxAccess()); // true
            });

            results.push(BallotBoxWriteGuard.HasBallotBoxAccess()); // true
        });

        expect(results).toEqual([true, true, true]);
        expect(BallotBoxWriteGuard.HasBallotBoxAccess()).toBe(false);
    });

    it('maintains separate async contexts', async () => {
        const results: boolean[] = [];

        const promise1 = BallotBoxWriteGuard.RunWithBallotBoxAccess(async () => {
            results.push(true); // inside first scope
            await new Promise((resolve) => setTimeout(resolve, 10)); // yield
            results.push(BallotBoxWriteGuard.HasBallotBoxAccess()); // should still be true in this context
        });

        const promise2 = (async () => {
            await new Promise((resolve) => setTimeout(resolve, 5)); // yield first
            results.push(BallotBoxWriteGuard.HasBallotBoxAccess()); // should be false (outside any scope)
        })();

        await Promise.all([promise1, promise2]);

        expect(results).toContain(false); // Outside scope
        expect(results.filter((r) => r === true).length).toBeGreaterThan(0); // Inside scope
    });

    it('returns the value from the async function', async () => {
        const result = await BallotBoxWriteGuard.RunWithBallotBoxAccess(async () => {
            return 'test-value';
        });

        expect(result).toBe('test-value');
    });

    it('propagates exceptions', async () => {
        await expect(
            BallotBoxWriteGuard.RunWithBallotBoxAccess(async () => {
                throw new Error('test error');
            })
        ).rejects.toThrow('test error');
    });
});

describe('TallyWriteGuard', () => {
    it('has no access outside RunWithTallyAccess', () => {
        expect(TallyWriteGuard.HasTallyAccess()).toBe(false);
    });

    it('has access inside RunWithTallyAccess', async () => {
        let insideAccess = false;
        await TallyWriteGuard.RunWithTallyAccess(async () => {
            insideAccess = TallyWriteGuard.HasTallyAccess();
        });
        expect(insideAccess).toBe(true);
    });

    it('loses access after RunWithTallyAccess completes', async () => {
        await TallyWriteGuard.RunWithTallyAccess(async () => {
            // inside
        });
        expect(TallyWriteGuard.HasTallyAccess()).toBe(false);
    });

    it('maintains separate async contexts from BallotBoxWriteGuard', async () => {
        const results: { ballot: boolean; tally: boolean }[] = [];

        await BallotBoxWriteGuard.RunWithBallotBoxAccess(async () => {
            results.push({
                ballot: BallotBoxWriteGuard.HasBallotBoxAccess(),
                tally: TallyWriteGuard.HasTallyAccess(),
            });
        });

        await TallyWriteGuard.RunWithTallyAccess(async () => {
            results.push({
                ballot: BallotBoxWriteGuard.HasBallotBoxAccess(),
                tally: TallyWriteGuard.HasTallyAccess(),
            });
        });

        expect(results[0]).toEqual({ ballot: true, tally: false });
        expect(results[1]).toEqual({ ballot: false, tally: true });
    });

    it('can be used inside BallotBoxWriteGuard scope', async () => {
        const results: boolean[] = [];

        await BallotBoxWriteGuard.RunWithBallotBoxAccess(async () => {
            results.push(BallotBoxWriteGuard.HasBallotBoxAccess()); // true
            results.push(TallyWriteGuard.HasTallyAccess()); // false

            await TallyWriteGuard.RunWithTallyAccess(async () => {
                results.push(BallotBoxWriteGuard.HasBallotBoxAccess()); // true (still in outer scope)
                results.push(TallyWriteGuard.HasTallyAccess()); // true (in tally scope)
            });

            results.push(TallyWriteGuard.HasTallyAccess()); // false (left tally scope)
        });

        expect(results).toEqual([true, false, true, true, false]);
    });
});

describe('ServerOperationScopeManager bridge', () => {
    it('bridges BallotBoxWriteGuard and TallyWriteGuard onto ServerOperationScopeManager.Instance', async () => {
        expect(ServerOperationScopeManager.Instance.IsOperationActive(BALLOT_BOX_ALLOWED_OPERATIONS)).toBe(false);
        expect(ServerOperationScopeManager.Instance.IsOperationActive(TALLY_ALLOWED_OPERATIONS)).toBe(false);

        await BallotBoxWriteGuard.RunWithBallotBoxAccess(async () => {
            expect(ServerOperationScopeManager.Instance.IsOperationActive([BALLOT_BOX_OPERATION_KEY])).toBe(true);
            expect(ServerOperationScopeManager.Instance.IsOperationActive(BALLOT_BOX_ALLOWED_OPERATIONS)).toBe(true);
            expect(ServerOperationScopeManager.Instance.IsOperationActive(TALLY_ALLOWED_OPERATIONS)).toBe(false);
        });

        await TallyWriteGuard.RunWithTallyAccess(async () => {
            expect(ServerOperationScopeManager.Instance.IsOperationActive([TALLY_OPERATION_KEY])).toBe(true);
            expect(ServerOperationScopeManager.Instance.IsOperationActive(TALLY_ALLOWED_OPERATIONS)).toBe(true);
            expect(ServerOperationScopeManager.Instance.IsOperationActive(BALLOT_BOX_ALLOWED_OPERATIONS)).toBe(false);
        });
    });

    it('grants ballot-box and tally access when domain Remote Operations execute via ServerOperationScopeManager.RunWithAuthority', async () => {
        await ServerOperationScopeManager.Instance.RunWithAuthority(
            { operationKey: 'Voting.EnterPaperBallot', source: 'RemotableOperation' },
            async () => {
                expect(BallotBoxWriteGuard.HasBallotBoxAccess()).toBe(true);
                expect(TallyWriteGuard.HasTallyAccess()).toBe(false);
            }
        );

        await ServerOperationScopeManager.Instance.RunWithAuthority(
            { operationKey: 'Voting.Tally', source: 'RemotableOperation' },
            async () => {
                expect(TallyWriteGuard.HasTallyAccess()).toBe(true);
                expect(BallotBoxWriteGuard.HasBallotBoxAccess()).toBe(false);
            }
        );
    });

    it('masks outer authority inside RunInClientCrudBoundary and RunWithoutAuthority so client CRUD cannot inherit engine authority', async () => {
        expect(ServerOperationScopeManager.Instance.GetTracker().IsAsyncSafe).toBe(true);
        await BallotBoxWriteGuard.RunWithBallotBoxAccess(async () => {
            expect(BallotBoxWriteGuard.HasBallotBoxAccess()).toBe(true);
            ServerOperationScopeManager.Instance.RunInClientCrudBoundary(() => {
                expect(BallotBoxWriteGuard.HasBallotBoxAccess()).toBe(false);
            });
            ServerOperationScopeManager.Instance.RunWithoutAuthority(() => {
                expect(BallotBoxWriteGuard.HasBallotBoxAccess()).toBe(false);
            });
            expect(BallotBoxWriteGuard.HasBallotBoxAccess()).toBe(true);
        });
    });
});
