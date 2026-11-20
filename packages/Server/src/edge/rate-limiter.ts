/**
 * Fixed-window rate limiter with a bounded key space and an injectable clock.
 *
 * DURABILITY. This store lives in process memory, so each API instance counts separately: behind N instances an
 * attacker gets up to N times the configured allowance. That is acceptable here only because it is not the
 * guard that protects voters. The guess-resistant limit is the durable per-credential lockout in VoterCredential
 * (FailedAttempts / LockedUntil, written by the credential methods), which every instance shares through the
 * database. This limiter bounds request volume and cost per (IP, slug). Neither MJ's shared cache nor an
 * atomic counter is exposed to server extensions, and there is no counter table, so a shared store would mean new
 * schema; the `RateLimitStore` seam lets one be dropped in later without touching the handlers.
 */

export interface RateLimitDecision {
    Allowed: boolean;
    /** Seconds until the window resets (always at least 1 when not allowed). */
    RetryAfterSeconds: number;
}

/** The seam a shared (multi-instance) store would implement. */
export interface RateLimitStore {
    Hit(key: string, max: number): RateLimitDecision;
    Clear(): void;
}

interface Window {
    Start: number;
    Count: number;
}

export class FixedWindowRateLimiter implements RateLimitStore {
    private readonly windows = new Map<string, Window>();
    private lastReapAt = 0;

    constructor(
        private readonly windowMs: number,
        private readonly maxKeys: number = 50_000,
        private readonly now: () => number = () => Date.now()
    ) {}

    /** Counts one hit against `key`; refuses once the window already holds `max` hits. */
    public Hit(key: string, max: number): RateLimitDecision {
        const t = this.now();
        this.reap(t);
        let w = this.windows.get(key);
        if (!w || t - w.Start >= this.windowMs) {
            this.evictIfFull();
            w = { Start: t, Count: 0 };
            this.windows.set(key, w);
        }
        if (w.Count >= max) {
            return { Allowed: false, RetryAfterSeconds: Math.max(1, Math.ceil((w.Start + this.windowMs - t) / 1000)) };
        }
        w.Count++;
        return { Allowed: true, RetryAfterSeconds: 0 };
    }

    public Clear(): void {
        this.windows.clear();
    }

    /** Number of live keys (for tests and diagnostics). */
    public get Size(): number {
        return this.windows.size;
    }

    private reap(t: number): void {
        if (t - this.lastReapAt < this.windowMs) return;
        this.lastReapAt = t;
        for (const [key, w] of this.windows) {
            if (t - w.Start >= this.windowMs) this.windows.delete(key);
        }
    }

    /** Oldest windows (insertion order) go first when the map is full. */
    private evictIfFull(): void {
        while (this.windows.size >= this.maxKeys) {
            const oldest = this.windows.keys().next();
            if (oldest.done) return;
            this.windows.delete(oldest.value);
        }
    }
}
