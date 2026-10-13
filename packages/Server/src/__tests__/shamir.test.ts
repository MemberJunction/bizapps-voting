import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { CombineShares, ParseShare, SplitSecret } from '../crypto/shamir.js';

function subsets<T>(items: T[], size: number): T[][] {
    if (size === 0) return [[]];
    if (items.length < size) return [];
    const [head, ...rest] = items;
    return [...subsets(rest, size - 1).map((s) => [head, ...s]), ...subsets(rest, size)];
}

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

describe('Shamir secret sharing', () => {
    it('every k-subset reconstructs the secret', () => {
        const secret = randomBytes(64);
        const shares = SplitSecret(secret, 5, 3);
        expect(shares).toHaveLength(5);
        for (const subset of subsets(shares, 3)) expect(hex(CombineShares(subset))).toBe(hex(secret));
    });

    it('more than k shares also reconstruct', () => {
        const secret = randomBytes(32);
        const shares = SplitSecret(secret, 6, 4);
        expect(hex(CombineShares(shares))).toBe(hex(secret));
        expect(hex(CombineShares(shares.slice(1, 6)))).toBe(hex(secret));
    });

    it('k-1 shares do not reconstruct the secret', () => {
        const secret = randomBytes(48);
        const shares = SplitSecret(secret, 5, 3);
        for (const subset of subsets(shares, 2)) expect(hex(CombineShares(subset))).not.toBe(hex(secret));
    });

    it('works for 2-of-2 and the 255-share maximum', () => {
        const secret = randomBytes(8);
        expect(hex(CombineShares(SplitSecret(secret, 2, 2)))).toBe(hex(secret));
        const many = SplitSecret(secret, 255, 200);
        expect(hex(CombineShares(many.slice(10, 210)))).toBe(hex(secret));
    });

    it('handles zero and 0xff bytes and a PEM-sized secret', () => {
        const edge = new Uint8Array([0, 255, 0, 255, 1, 0]);
        expect(hex(CombineShares(SplitSecret(edge, 3, 2).slice(1)))).toBe(hex(edge));
        const big = randomBytes(2500);
        expect(hex(CombineShares(SplitSecret(big, 4, 3).slice(0, 3)))).toBe(hex(big));
    });

    it('uses fresh randomness each split', () => {
        const secret = randomBytes(16);
        expect(SplitSecret(secret, 3, 2)[0]).not.toBe(SplitSecret(secret, 3, 2)[0]);
    });

    it('encodes shares as index-hex with 1-based indices', () => {
        const shares = SplitSecret(randomBytes(4), 3, 2);
        shares.forEach((s, i) => {
            expect(s).toMatch(/^\d+-[0-9a-f]{8}$/);
            expect(ParseShare(s).Index).toBe(i + 1);
        });
    });

    it('rejects bad parameters and bad shares', () => {
        const secret = randomBytes(4);
        expect(() => SplitSecret(secret, 3, 1)).toThrow();
        expect(() => SplitSecret(secret, 2, 3)).toThrow();
        expect(() => SplitSecret(secret, 256, 2)).toThrow();
        expect(() => SplitSecret(new Uint8Array(0), 3, 2)).toThrow();
        const shares = SplitSecret(secret, 3, 2);
        expect(() => CombineShares([shares[0], shares[0]])).toThrow();
        expect(() => CombineShares([shares[0]])).toThrow();
        expect(() => CombineShares([shares[0], 'garbage'])).toThrow();
        expect(() => CombineShares([shares[0], '2-abcd'])).toThrow();
    });
});
