import { describe, expect, it, vi } from 'vitest';
import type { MagicLinkJWTClaims } from '@memberjunction/server';
import { BuildBallotSessionClaims, DEFAULT_SESSION_TTL_MINUTES, ResolveSessionTtlMinutes, type SessionClaimsArgs } from '../edge/session-claims.js';
import { VoterIdentityResolver } from '../shared/voter-identity.js';

/** A stand-in for MJ's BuildSessionClaims that records its arguments and echoes the fields the real one maps. */
function stubBuilder() {
    return vi.fn((a: SessionClaimsArgs): MagicLinkJWTClaims => ({
        iss: a.issuer,
        aud: a.audience,
        sub: `magic-link|${a.inviteId}`,
        iat: a.nowSeconds,
        exp: a.nowSeconds + a.ttlSeconds,
        email: a.email,
        mj_app_id: a.applicationId,
        mj_role: a.roleName,
        mj_scopes: [{ inviteId: a.inviteId, appId: a.applicationId, role: a.roleName, resourceType: a.resourceType, resourceId: a.resourceId }],
        mj_anon: a.anonymous ? true : undefined,
        mj_sid: a.sessionId,
        mj_magic_link: true,
    }));
}

const input = {
    Issuer: 'https://api.example.org',
    Audience: 'mj-magic-link',
    AnonymousEmail: 'anonymous@magic-link.local',
    ApplicationID: 'app-1',
    GuestRoleName: 'Magic Link Baseline',
    ElectionID: 'ELECTION-1',
    EligibleVoterID: 'VOTER-9',
    SessionID: 'sess-abc',
    NowSeconds: 1_000_000,
    TtlSeconds: 1800,
};

describe('BuildBallotSessionClaims', () => {
    it('mints an anonymous, election-and-voter-scoped session as the shared Anonymous principal', () => {
        const build = stubBuilder();
        const claims = BuildBallotSessionClaims(input, build);
        const args = build.mock.calls[0][0];
        expect(args.anonymous).toBe(true);
        expect(args.email).toBe('anonymous@magic-link.local');
        expect(args.resourceType).toBe(VoterIdentityResolver.GuestResourceType);
        expect(args.resourceId).toBe(VoterIdentityResolver.EncodeGuestResource('ELECTION-1', 'VOTER-9'));
        expect(claims.mj_anon).toBe(true);
        expect(claims.exp - claims.iat).toBe(1800);
        expect(claims.iss).toBe('https://api.example.org');
        expect(claims.aud).toBe('mj-magic-link');
        expect(claims.mj_scopes?.[0].resourceId).toBe('ELECTION-1:VOTER-9');
    });

    it('never puts the voter email or any credential in the claims', () => {
        const claims = JSON.stringify(BuildBallotSessionClaims(input, stubBuilder()));
        expect(claims).not.toMatch(/@(?!magic-link\.local)/);
    });
});

describe('ResolveSessionTtlMinutes', () => {
    it('defaults to 30 and honours either key', () => {
        expect(DEFAULT_SESSION_TTL_MINUTES).toBe(30);
        expect(ResolveSessionTtlMinutes({})).toBe(30);
        expect(ResolveSessionTtlMinutes({ SessionTtlMinutes: 45 })).toBe(45);
        expect(ResolveSessionTtlMinutes({ 'voting.sessionTtlMinutes': '10' })).toBe(10);
    });
    it('clamps and falls back on bad values', () => {
        expect(ResolveSessionTtlMinutes({ SessionTtlMinutes: 0 })).toBe(1);
        expect(ResolveSessionTtlMinutes({ SessionTtlMinutes: 99999 })).toBe(240);
        expect(ResolveSessionTtlMinutes({ SessionTtlMinutes: 'abc' })).toBe(30);
        expect(ResolveSessionTtlMinutes({ SessionTtlMinutes: NaN })).toBe(30);
    });
});
