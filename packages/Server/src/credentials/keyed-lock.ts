/**
 * An in-process, per-key mutex. It serializes the check-then-set steps that make a credential single-use or count
 * failed attempts, so concurrent requests to one API instance cannot both pass. Across several API instances the
 * database's one-ballot-per-voter constraint (Participation) remains the final guard.
 */

const tails = new Map<string, Promise<void>>();

export async function WithKeyedLock<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = tails.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    const tail = previous.then(() => gate);
    tails.set(key, tail);
    await previous;
    try {
        return await work();
    } finally {
        release();
        if (tails.get(key) === tail) tails.delete(key);
    }
}
