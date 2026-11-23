/**
 * Write Guards for Ballot Box and Tally Access
 * Enforce that only specific engines can write to sensitive ballot and result entities.
 * Uses AsyncLocalStorage for scope isolation without globals.
 */

// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference types="node" />
import { AsyncLocalStorage } from 'async_hooks';

class BallotBoxWriteGuardImpl {
    private storage = new AsyncLocalStorage<boolean>();

    public async RunWithBallotBoxAccess<T>(fn: () => Promise<T>): Promise<T> {
        return this.storage.run(true, fn);
    }

    public HasBallotBoxAccess(): boolean {
        return this.storage.getStore() === true;
    }
}

class TallyWriteGuardImpl {
    private storage = new AsyncLocalStorage<boolean>();

    public async RunWithTallyAccess<T>(fn: () => Promise<T>): Promise<T> {
        return this.storage.run(true, fn);
    }

    public HasTallyAccess(): boolean {
        return this.storage.getStore() === true;
    }
}

/** Singleton instances of the write guards. */
export const BallotBoxWriteGuard = new BallotBoxWriteGuardImpl();
export const TallyWriteGuard = new TallyWriteGuardImpl();
