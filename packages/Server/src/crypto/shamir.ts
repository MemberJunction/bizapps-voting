/**
 * Shamir secret sharing over GF(2^8) (design section 4.4, tier B).
 *
 * A secret of any length is split byte by byte: each byte is the constant term of a random polynomial of degree k-1
 * over GF(256) (reduction polynomial 0x11b, the AES field), and share `i` holds the polynomial evaluated at x = i.
 * Any k shares recover the secret by Lagrange interpolation at x = 0; k-1 or fewer reveal nothing about it.
 *
 * Coefficients come from node:crypto's CSPRNG. Shares are encoded as `${index}-${hex}` with index 1..255.
 *
 * NOTE: combining fewer than k shares returns garbage rather than an error (the scheme cannot tell the difference);
 * callers verify the reconstructed secret (the trustee engine checks it against the election public key).
 */

import { randomBytes } from 'node:crypto';

export const MAX_SHARES = 255;

// --- GF(256) arithmetic (log/antilog tables, generator 3) ---

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

(function BuildTables(): void {
    let x = 1;
    for (let i = 0; i < 255; i++) {
        EXP[i] = x;
        LOG[x] = i;
        // x * 3 = x * 2 xor x, with reduction by 0x11b
        let doubled = x << 1;
        if (doubled & 0x100) doubled ^= 0x11b;
        x = doubled ^ x;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

export function GfMul(a: number, b: number): number {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
}

export function GfDiv(a: number, b: number): number {
    if (b === 0) throw new Error('Division by zero in GF(256).');
    if (a === 0) return 0;
    return EXP[LOG[a] + 255 - LOG[b]];
}

/** Evaluates the polynomial with the given coefficients (constant term first) at x using Horner's rule. */
function EvaluatePolynomial(coefficients: Uint8Array, x: number): number {
    let result = 0;
    for (let i = coefficients.length - 1; i >= 0; i--) {
        result = GfMul(result, x) ^ coefficients[i];
    }
    return result;
}

// --- Share encoding ---

export interface ParsedShare {
    Index: number;
    Bytes: Uint8Array;
}

export function EncodeShare(index: number, bytes: Uint8Array): string {
    return `${index}-${Buffer.from(bytes).toString('hex')}`;
}

const SHARE_PATTERN = /^(\d{1,3})-([0-9a-f]+)$/;

/** Parses `${index}-${hex}`. Throws on any other shape. */
export function ParseShare(share: string): ParsedShare {
    const m = SHARE_PATTERN.exec(share.trim().toLowerCase());
    if (!m) throw new Error('A key share must look like "<index>-<hex>".');
    const index = Number(m[1]);
    if (index < 1 || index > MAX_SHARES) throw new Error('A key share index must be between 1 and 255.');
    if (m[2].length % 2 !== 0) throw new Error('A key share must hold whole bytes.');
    return { Index: index, Bytes: new Uint8Array(Buffer.from(m[2], 'hex')) };
}

/** The share index of an encoded share, or null when it is not well formed. */
export function ShareIndexOf(share: string): number | null {
    try {
        return ParseShare(share).Index;
    } catch {
        return null;
    }
}

// --- Split / combine ---

/**
 * Splits `secret` into `n` shares of which any `k` recover it.
 * @param secret The bytes to protect.
 * @param n Number of shares, k..255.
 * @param k Threshold, 2..n.
 * @returns n encoded shares, share i (1-based) at position i-1.
 */
export function SplitSecret(secret: Uint8Array, n: number, k: number): string[] {
    if (!Number.isInteger(n) || !Number.isInteger(k)) throw new Error('n and k must be integers.');
    if (k < 2) throw new Error('The threshold k must be at least 2.');
    if (n < k) throw new Error('The share count n must be at least the threshold k.');
    if (n > MAX_SHARES) throw new Error(`At most ${MAX_SHARES} shares are supported.`);
    if (secret.length === 0) throw new Error('The secret must not be empty.');

    const shareBytes: Uint8Array[] = Array.from({ length: n }, () => new Uint8Array(secret.length));
    for (let pos = 0; pos < secret.length; pos++) {
        const coefficients = new Uint8Array(k);
        coefficients[0] = secret[pos];
        coefficients.set(randomBytes(k - 1), 1);
        for (let i = 0; i < n; i++) {
            shareBytes[i][pos] = EvaluatePolynomial(coefficients, i + 1);
        }
        coefficients.fill(0);
    }
    return shareBytes.map((bytes, i) => EncodeShare(i + 1, bytes));
}

/**
 * Recovers the secret from at least k distinct encoded shares (pass exactly the shares you hold; extra shares are
 * harmless as long as they all belong to the same split). Throws on malformed, duplicate or mismatched-length shares.
 */
export function CombineShares(shares: string[]): Uint8Array {
    if (shares.length < 2) throw new Error('At least two shares are needed to combine.');
    const parsed = shares.map(ParseShare);
    const indices = new Set<number>();
    for (const p of parsed) {
        if (indices.has(p.Index)) throw new Error('Duplicate share index.');
        indices.add(p.Index);
    }
    const length = parsed[0].Bytes.length;
    if (parsed.some((p) => p.Bytes.length !== length)) throw new Error('The shares are not all the same length.');

    // Lagrange basis weights at x = 0: w_i = prod_{j != i} x_j / (x_i xor x_j)
    const weights = parsed.map((pi, i) => {
        let w = 1;
        for (let j = 0; j < parsed.length; j++) {
            if (j === i) continue;
            w = GfMul(w, GfDiv(parsed[j].Index, parsed[i].Index ^ parsed[j].Index));
        }
        return w;
    });

    const secret = new Uint8Array(length);
    for (let pos = 0; pos < length; pos++) {
        let acc = 0;
        for (let i = 0; i < parsed.length; i++) {
            acc ^= GfMul(parsed[i].Bytes[pos], weights[i]);
        }
        secret[pos] = acc;
    }
    return secret;
}
