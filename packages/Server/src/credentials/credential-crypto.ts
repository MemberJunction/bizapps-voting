/**
 * Pure secret handling for voter credentials: tokens, control numbers, PIN hashing, lockout decisions and the
 * matching order that ties an asserted identity to a roll entry. Nothing here touches the database, and nothing logs a secret.
 */

import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';

// ─── Tokens and links ──────────────────────────────────────────────────────

/** 32 random bytes as base64url: the secret in an emailed ballot link. */
export function GenerateToken(): string {
    return randomBytes(32).toString('base64url');
}

/** SHA-256 hex of a secret. Only this digest is ever stored. */
export function HashSecret(secret: string): string {
    return createHash('sha256').update(secret, 'utf8').digest('hex');
}

/** Constant-time comparison of two hex digests of equal intended length. */
export function ConstantTimeEqualHex(a: string, b: string): boolean {
    const ba = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
}

/**
 * The ballot link. The token rides in the URL FRAGMENT (`#t=`), which browsers never send to servers, so it stays out of
 * server logs and Referer headers. Never put it in the query string.
 */
export function BuildBallotLink(baseUrl: string, slug: string, token: string): string {
    return `${baseUrl.replace(/\/+$/, '')}/vote/${encodeURIComponent(slug)}#t=${token}`;
}

// ─── Control numbers (paper and proxy) ─────────────────────────────────────

const CONTROL_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32: no I, L, O, U

/** A random control number: 16 characters (80 bits) in four groups, e.g. `7K3Q-0M2X-VH9D-4TRB`. */
export function GenerateControlNumber(): string {
    const bytes = randomBytes(16);
    let out = '';
    for (let i = 0; i < 16; i++) {
        out += CONTROL_ALPHABET[bytes[i] & 31];
        if (i % 4 === 3 && i < 15) out += '-';
    }
    return out;
}

/** Canonical form for hashing: upper case, dashes and spaces removed, look-alike letters mapped (I,L to 1; O to 0). */
export function NormalizeControlNumber(input: string): string {
    return input.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
}

/** The digest stored in VoterCredential.ControlNumberHash. */
export function HashControlNumber(input: string): string {
    return HashSecret(NormalizeControlNumber(input));
}

// ─── PINs ──────────────────────────────────────────────────────────────────

const SCRYPT_KEYLEN = 32;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;

function scryptAsync(secret: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        scrypt(secret, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS, (err, key) => (err ? reject(err) : resolve(key)));
    });
}

/** A random numeric PIN of the given length (default 8 digits). */
export function GeneratePin(digits = 8): string {
    let pin = '';
    for (let i = 0; i < digits; i++) pin += String(randomInt(0, 10));
    return pin;
}

/** Hashes a PIN with scrypt and a per-credential salt, as `scrypt$<salt>$<hash>` (both base64url). */
export async function HashPin(pin: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await scryptAsync(pin, salt);
    return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

let dummyPinHash: Promise<string> | null = null;

/** Verifies a PIN against a stored `scrypt$salt$hash`, in constant time. A malformed stored value never verifies. */
export async function VerifyPin(pin: string, stored: string | null | undefined): Promise<boolean> {
    const parts = (stored ?? '').split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') {
        await scryptAsync(pin, randomBytes(16)); // keep the cost of a bad record equal to a real check
        return false;
    }
    const salt = Buffer.from(parts[1], 'base64url');
    const expected = Buffer.from(parts[2], 'base64url');
    const actual = await scryptAsync(pin, salt);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Spends the same time as a real PIN check; used when no credential exists, so lookups do not reveal who is enrolled. */
export async function BurnPinCheck(pin: string): Promise<void> {
    dummyPinHash ??= HashPin('not-a-real-pin');
    await VerifyPin(pin, await dummyPinHash);
}

// ─── Lockout ───────────────────────────────────────────────────────────────

export interface LockoutPolicy {
    MaxFailedAttempts: number;
    LockoutMinutes: number;
}

export const DEFAULT_LOCKOUT_POLICY: LockoutPolicy = { MaxFailedAttempts: 5, LockoutMinutes: 15 };

/** Reads MaxFailedAttempts / LockoutMinutes from a method Configuration object; bad or missing values fall back to defaults. */
export function ParseLockoutPolicy(config: Record<string, unknown>): LockoutPolicy {
    const max = Number(config.MaxFailedAttempts);
    const minutes = Number(config.LockoutMinutes);
    return {
        MaxFailedAttempts: Number.isInteger(max) && max >= 1 ? max : DEFAULT_LOCKOUT_POLICY.MaxFailedAttempts,
        LockoutMinutes: Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_LOCKOUT_POLICY.LockoutMinutes,
    };
}

export interface LockoutState {
    FailedAttempts: number;
    LockedUntil: Date | null;
}

/** True while a lock is in force. */
export function IsLockedOut(state: LockoutState, now: Date): boolean {
    return state.LockedUntil !== null && state.LockedUntil.getTime() > now.getTime();
}

/** The state after one failed attempt: the Nth failure locks the credential and restarts the count. */
export function RegisterFailedAttempt(state: LockoutState, policy: LockoutPolicy, now: Date): LockoutState {
    const attempts = state.FailedAttempts + 1;
    if (attempts >= policy.MaxFailedAttempts) {
        return { FailedAttempts: 0, LockedUntil: new Date(now.getTime() + policy.LockoutMinutes * 60_000) };
    }
    return { FailedAttempts: attempts, LockedUntil: state.LockedUntil };
}

// ─── Matching an asserted identity to the roll ─────────────────────────────

/** Lookups the matcher needs; the real ones read the roll, tests supply stubs. Each returns EligibleVoter IDs. */
export interface RollFinders {
    BySourceKey(sourceKey: string): Promise<string[]>;
    ByEmail(email: string): Promise<string[]>;
}

export type RollMatch =
    | { Kind: 'Matched'; EligibleVoterID: string; MatchedBy: 'SourceKey' | 'Email' }
    | { Kind: 'Ambiguous'; MatchedBy: 'SourceKey' | 'Email' }
    | { Kind: 'NotOnRoll' };

function distinctIds(ids: string[]): string[] {
    const seen = new Set<string>();
    return ids.filter((id) => {
        const k = id.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

/**
 * The order of matching: roster/source key first, then email. A key that finds exactly one entry wins; a key that finds
 * several is ambiguous and does NOT fall through to email (never guess who someone is); a key that finds none falls through.
 */
export async function MatchRollEntry(identity: { SourceKey?: string | null; Email?: string | null }, finders: RollFinders): Promise<RollMatch> {
    const sourceKey = identity.SourceKey?.trim();
    if (sourceKey) {
        const ids = distinctIds(await finders.BySourceKey(sourceKey));
        if (ids.length === 1) return { Kind: 'Matched', EligibleVoterID: ids[0], MatchedBy: 'SourceKey' };
        if (ids.length > 1) return { Kind: 'Ambiguous', MatchedBy: 'SourceKey' };
    }
    const email = identity.Email?.trim().toLowerCase();
    if (email) {
        const ids = distinctIds(await finders.ByEmail(email));
        if (ids.length === 1) return { Kind: 'Matched', EligibleVoterID: ids[0], MatchedBy: 'Email' };
        if (ids.length > 1) return { Kind: 'Ambiguous', MatchedBy: 'Email' };
    }
    return { Kind: 'NotOnRoll' };
}

/** Parses BallotDistribution.AllowedCredentialMethods: a JSON array of codes, or codes separated by commas/whitespace. */
export function ParseAllowedMethods(text: string | null | undefined): string[] {
    if (!text || !text.trim()) return [];
    const trimmed = text.trim();
    if (trimmed.startsWith('[')) {
        try {
            const parsed: unknown = JSON.parse(trimmed);
            if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === 'string').map((v) => v.trim().toLowerCase()).filter(Boolean);
        } catch {
            return [];
        }
    }
    return trimmed.split(/[\s,;]+/).map((v) => v.toLowerCase()).filter(Boolean);
}
