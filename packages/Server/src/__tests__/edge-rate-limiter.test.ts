import { describe, expect, it } from 'vitest';
import { FixedWindowRateLimiter } from '../edge/rate-limiter.js';

describe('FixedWindowRateLimiter', () => {
    it('allows up to max hits per window then refuses with a retry hint', () => {
        let t = 1_000;
        const rl = new FixedWindowRateLimiter(60_000, 100, () => t);
        expect(rl.Hit('k', 2).Allowed).toBe(true);
        expect(rl.Hit('k', 2).Allowed).toBe(true);
        t += 10_000;
        const refused = rl.Hit('k', 2);
        expect(refused.Allowed).toBe(false);
        expect(refused.RetryAfterSeconds).toBe(50);
    });

    it('starts a fresh window once the old one elapses', () => {
        let t = 0;
        const rl = new FixedWindowRateLimiter(1_000, 100, () => t);
        rl.Hit('k', 1);
        expect(rl.Hit('k', 1).Allowed).toBe(false);
        t = 1_000;
        expect(rl.Hit('k', 1).Allowed).toBe(true);
    });

    it('keys are independent', () => {
        const rl = new FixedWindowRateLimiter(60_000);
        rl.Hit('a', 1);
        expect(rl.Hit('a', 1).Allowed).toBe(false);
        expect(rl.Hit('b', 1).Allowed).toBe(true);
    });

    it('bounds the key space, evicting the oldest', () => {
        const rl = new FixedWindowRateLimiter(60_000, 3);
        for (const k of ['a', 'b', 'c', 'd']) rl.Hit(k, 5);
        expect(rl.Size).toBe(3);
    });

    it('reaps expired windows', () => {
        let t = 0;
        const rl = new FixedWindowRateLimiter(1_000, 100, () => t);
        rl.Hit('a', 5);
        rl.Hit('b', 5);
        t = 5_000;
        rl.Hit('c', 5);
        expect(rl.Size).toBe(1);
    });
});
