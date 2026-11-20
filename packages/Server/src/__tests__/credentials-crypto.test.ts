import { describe, expect, it } from 'vitest';
import {
    BuildBallotLink,
    BurnPinCheck,
    ConstantTimeEqualHex,
    GenerateControlNumber,
    GeneratePin,
    GenerateToken,
    HashControlNumber,
    HashPin,
    HashSecret,
    IsLockedOut,
    MatchRollEntry,
    NormalizeControlNumber,
    ParseAllowedMethods,
    ParseLockoutPolicy,
    RegisterFailedAttempt,
    VerifyPin,
    type RollFinders,
} from '../credentials/credential-crypto.js';
import { WithKeyedLock } from '../credentials/keyed-lock.js';

describe('tokens and links', () => {
    it('generates 32 random bytes as base64url and hashes with SHA-256', () => {
        const a = GenerateToken();
        const b = GenerateToken();
        expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(a).not.toBe(b);
        const h = HashSecret(a);
        expect(h).toMatch(/^[0-9a-f]{64}$/);
        expect(h).not.toContain(a);
        expect(HashSecret('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });

    it('puts the token in the URL fragment, never the query string', () => {
        const link = BuildBallotLink('https://vote.example.org/', 'board 2026', 'TOK');
        expect(link).toBe('https://vote.example.org/vote/board%202026#t=TOK');
        expect(link.split('#')[0]).not.toContain('TOK');
        expect(link).not.toContain('?');
    });

    it('compares digests in constant time and rejects length mismatches', () => {
        expect(ConstantTimeEqualHex('abcd', 'abcd')).toBe(true);
        expect(ConstantTimeEqualHex('abcd', 'abce')).toBe(false);
        expect(ConstantTimeEqualHex('abcd', 'abc')).toBe(false);
    });
});

describe('control numbers', () => {
    it('are random, grouped, and hash after normalization', () => {
        const n = GenerateControlNumber();
        expect(n).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);
        expect(n).not.toBe(GenerateControlNumber());
        expect(HashControlNumber(n.toLowerCase().replace(/-/g, ' '))).toBe(HashControlNumber(n));
        expect(NormalizeControlNumber('o1il-0')).toBe('01110');
    });
});

describe('PIN hashing', () => {
    it('stores scrypt$salt$hash with a per-credential salt and verifies', async () => {
        const pin = GeneratePin();
        expect(pin).toMatch(/^\d{8}$/);
        const stored = await HashPin(pin);
        const parts = stored.split('$');
        expect(parts).toHaveLength(3);
        expect(parts[0]).toBe('scrypt');
        expect(stored).not.toContain(pin);
        expect(await HashPin(pin)).not.toBe(stored); // different salt
        expect(await VerifyPin(pin, stored)).toBe(true);
        expect(await VerifyPin('00000000', stored)).toBe(false);
    });

    it('never verifies a malformed stored value', async () => {
        expect(await VerifyPin('1234', null)).toBe(false);
        expect(await VerifyPin('1234', 'plaintext')).toBe(false);
        expect(await VerifyPin('1234', 'scrypt$onlytwo')).toBe(false);
        await expect(BurnPinCheck('1234')).resolves.toBeUndefined();
    });
});

describe('lockout decisions', () => {
    const policy = { MaxFailedAttempts: 3, LockoutMinutes: 10 };
    const now = new Date('2026-10-12T12:00:00Z');

    it('counts failures and locks on the Nth', () => {
        let state = { FailedAttempts: 0, LockedUntil: null as Date | null };
        state = RegisterFailedAttempt(state, policy, now);
        state = RegisterFailedAttempt(state, policy, now);
        expect(state).toEqual({ FailedAttempts: 2, LockedUntil: null });
        expect(IsLockedOut(state, now)).toBe(false);
        state = RegisterFailedAttempt(state, policy, now);
        expect(state.FailedAttempts).toBe(0);
        expect(state.LockedUntil?.toISOString()).toBe('2026-10-12T12:10:00.000Z');
        expect(IsLockedOut(state, now)).toBe(true);
        expect(IsLockedOut(state, new Date('2026-10-12T12:10:00.001Z'))).toBe(false);
    });

    it('reads the method configuration, falling back to defaults', () => {
        expect(ParseLockoutPolicy({ MaxFailedAttempts: 7, LockoutMinutes: 30 })).toEqual({ MaxFailedAttempts: 7, LockoutMinutes: 30 });
        expect(ParseLockoutPolicy({ MaxFailedAttempts: 0, LockoutMinutes: -1 })).toEqual({ MaxFailedAttempts: 5, LockoutMinutes: 15 });
        expect(ParseLockoutPolicy({})).toEqual({ MaxFailedAttempts: 5, LockoutMinutes: 15 });
    });
});

describe('roll matching order (host assertion and SSO)', () => {
    const finders = (bySource: string[], byEmail: string[]): RollFinders & { Calls: string[] } => {
        const calls: string[] = [];
        return {
            Calls: calls,
            BySourceKey: async () => {
                calls.push('key');
                return bySource;
            },
            ByEmail: async () => {
                calls.push('email');
                return byEmail;
            },
        };
    };

    it('matches by source key first and does not consult email', async () => {
        const f = finders(['V1'], ['V2']);
        expect(await MatchRollEntry({ SourceKey: 'k', Email: 'a@x.org' }, f)).toEqual({ Kind: 'Matched', EligibleVoterID: 'V1', MatchedBy: 'SourceKey' });
        expect(f.Calls).toEqual(['key']);
    });

    it('falls back to email when the key finds no one', async () => {
        const f = finders([], ['V2']);
        expect(await MatchRollEntry({ SourceKey: 'k', Email: 'A@X.org' }, f)).toEqual({ Kind: 'Matched', EligibleVoterID: 'V2', MatchedBy: 'Email' });
        expect(f.Calls).toEqual(['key', 'email']);
    });

    it('treats several matches as ambiguous and never falls through after an ambiguous key', async () => {
        const f = finders(['V1', 'V3'], ['V2']);
        expect(await MatchRollEntry({ SourceKey: 'k', Email: 'a@x.org' }, f)).toEqual({ Kind: 'Ambiguous', MatchedBy: 'SourceKey' });
        expect(f.Calls).toEqual(['key']);
        expect(await MatchRollEntry({ Email: 'a@x.org' }, finders([], ['V2', 'v2', 'V4']))).toEqual({ Kind: 'Ambiguous', MatchedBy: 'Email' });
    });

    it('collapses the same voter ID in different case and reports not-on-roll', async () => {
        expect(await MatchRollEntry({ Email: 'a@x.org' }, finders([], ['V2', 'v2']))).toMatchObject({ Kind: 'Matched' });
        expect(await MatchRollEntry({ SourceKey: ' ', Email: '' }, finders(['V1'], ['V2']))).toEqual({ Kind: 'NotOnRoll' });
    });
});

describe('allowed method list', () => {
    it('parses JSON arrays and delimited text', () => {
        expect(ParseAllowedMethods('["Emailed-Link","sso"]')).toEqual(['emailed-link', 'sso']);
        expect(ParseAllowedMethods('emailed-link, sso;mj-session')).toEqual(['emailed-link', 'sso', 'mj-session']);
        expect(ParseAllowedMethods(null)).toEqual([]);
        expect(ParseAllowedMethods('[bad')).toEqual([]);
    });
});

describe('keyed lock', () => {
    it('serializes work on the same key', async () => {
        const order: string[] = [];
        const slow = WithKeyedLock('k', async () => {
            order.push('a-start');
            await new Promise((r) => setTimeout(r, 20));
            order.push('a-end');
        });
        const fast = WithKeyedLock('k', async () => {
            order.push('b');
        });
        await Promise.all([slow, fast]);
        expect(order).toEqual(['a-start', 'a-end', 'b']);
    });
});
