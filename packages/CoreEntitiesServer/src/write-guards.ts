/**
 * Write Guards for Ballot Box and Tally Access
 * Bridges onto MemberJunction's platform-level `ServerOperationScopeManager` (`@memberjunction/core`)
 * so that `WriteAuthority: { mode: 'ServerOperationOnly', allowedOperations: [...] }` policies on
 * `EntityLifecyclePolicyEngine.Instance` and existing callers of `BallotBoxWriteGuard` / `TallyWriteGuard`
 * share a single authoritative scope stack with `AsyncLocalStorage` isolation.
 */

// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference types="node" />
import { AsyncLocalStorage } from 'async_hooks';
import {
    ServerOperationScopeManager,
    type IServerOperationScopeTracker,
    type ServerOperationScopeFrame,
} from '@memberjunction/core';

export const BALLOT_BOX_OPERATION_KEY = 'Voting.CastBallot';
export const BALLOT_BOX_ALLOWED_OPERATIONS: ReadonlyArray<string> = [
    'Voting.CastBallot',
    'Voting.EnterPaperBallot',
    'Voting.BallotBox',
];

export const TALLY_OPERATION_KEY = 'Voting.Tally';
export const TALLY_ALLOWED_OPERATIONS: ReadonlyArray<string> = [
    'Voting.Tally',
    'Voting.TallyEngine',
];

/**
 * Concurrency-safe Node.js `AsyncLocalStorage` tracker for `ServerOperationScopeManager` when
 * `@memberjunction/generic-database-provider` has not yet replaced the default browser stack tracker.
 */
class NodeAsyncServerOperationScopeTrackerBridge implements IServerOperationScopeTracker {
    public readonly IsAsyncSafe = true;
    private readonly _storage = new AsyncLocalStorage<ReadonlyArray<ServerOperationScopeFrame>>();

    public RunInScope<T>(frame: ServerOperationScopeFrame, fn: () => T): T {
        const current = this._storage.getStore() ?? [];
        const nextFrames: ReadonlyArray<ServerOperationScopeFrame> = [...current, frame];
        return this._storage.run(nextFrames, fn);
    }

    public RunWithoutAuthority<T>(fn: () => T): T {
        return this._storage.run([], fn);
    }

    public GetActiveFrames(): ReadonlyArray<ServerOperationScopeFrame> {
        return this._storage.getStore() ?? [];
    }
}

function ensureAsyncScopeTrackerInstalled(): void {
    const tracker = ServerOperationScopeManager?.Instance?.GetTracker();
    if (tracker && !tracker.IsAsyncSafe) {
        ServerOperationScopeManager.Instance.SetTracker(new NodeAsyncServerOperationScopeTrackerBridge());
    }
}

ensureAsyncScopeTrackerInstalled();

class BallotBoxWriteGuardImpl {
    public async RunWithBallotBoxAccess<T>(fn: () => Promise<T>): Promise<T> {
        ensureAsyncScopeTrackerInstalled();
        return ServerOperationScopeManager.Instance.RunWithAuthority(
            {
                operationKey: BALLOT_BOX_OPERATION_KEY,
                source: 'ServerEngine',
            },
            fn
        );
    }

    public HasBallotBoxAccess(): boolean {
        return ServerOperationScopeManager.Instance.IsOperationActive(BALLOT_BOX_ALLOWED_OPERATIONS);
    }
}

class TallyWriteGuardImpl {
    public async RunWithTallyAccess<T>(fn: () => Promise<T>): Promise<T> {
        ensureAsyncScopeTrackerInstalled();
        return ServerOperationScopeManager.Instance.RunWithAuthority(
            {
                operationKey: TALLY_OPERATION_KEY,
                source: 'ServerEngine',
            },
            fn
        );
    }

    public HasTallyAccess(): boolean {
        return ServerOperationScopeManager.Instance.IsOperationActive(TALLY_ALLOWED_OPERATIONS);
    }
}

/** Singleton instances of the write guards. */
export const BallotBoxWriteGuard = new BallotBoxWriteGuardImpl();
export const TallyWriteGuard = new TallyWriteGuardImpl();
