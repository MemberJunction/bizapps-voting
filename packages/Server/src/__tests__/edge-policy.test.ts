import { describe, expect, it } from 'vitest';
import {
    BuildHostCsp,
    FrameAncestorsDirective,
    HostSecurityHeaders,
    IsSameOrigin,
    IsValidSlug,
    OriginAllowed,
    ParseAllowedOrigins,
    ResolveClientIp,
    StripHostResponseHeaders,
} from '../edge/edge-policy.js';

describe('edge policy: CSP', () => {
    it('carries the nonce in script-src and locks the rest to self', () => {
        const csp = BuildHostCsp('abc123_-', []);
        expect(csp).toContain("script-src 'nonce-abc123_-'");
        expect(csp).toContain("default-src 'self'");
        expect(csp).toContain("connect-src 'self'");
        expect(csp).not.toMatch(/script-src[^;]*unsafe/);
    });

    it('strips characters that could break out of the nonce expression', () => {
        const csp = BuildHostCsp("x'; script-src *", []);
        expect(csp).toContain("script-src 'nonce-xscript-src'");
        expect(csp).not.toContain('script-src *');
    });

    it("uses frame-ancestors 'none' when the distribution names no origins", () => {
        expect(FrameAncestorsDirective([])).toBe("frame-ancestors 'none'");
        expect(HostSecurityHeaders('n', [])['X-Frame-Options']).toBe('DENY');
    });

    it('lists the distribution origins in frame-ancestors and drops X-Frame-Options', () => {
        const headers = HostSecurityHeaders('n', ['https://a.example.org', 'https://B.example.org/']);
        expect(headers['Content-Security-Policy']).toContain('frame-ancestors https://a.example.org https://b.example.org');
        expect(headers['X-Frame-Options']).toBeUndefined();
        expect(headers['Referrer-Policy']).toBe('no-referrer');
    });
});

describe('edge policy: origins', () => {
    it('parses JSON and delimited lists, dropping wildcards and non-http entries', () => {
        expect(ParseAllowedOrigins('["https://a.org/x", "*", "javascript:alert(1)", "http://b.org"]')).toEqual(['https://a.org', 'http://b.org']);
        expect(ParseAllowedOrigins('https://a.org, https://a.org  https://c.org;')).toEqual(['https://a.org', 'https://c.org']);
        expect(ParseAllowedOrigins('*')).toEqual([]);
        expect(ParseAllowedOrigins(null)).toEqual([]);
        expect(ParseAllowedOrigins('[not json')).toEqual([]);
    });

    it('allows same-origin and listed origins, denies everything else including with an empty list', () => {
        expect(OriginAllowed('https://api.example.org', [], 'api.example.org')).toBe(true);
        expect(OriginAllowed('https://a.org', ['https://a.org'], 'api.example.org')).toBe(true);
        expect(OriginAllowed('https://A.org/', ['https://a.org'], 'api.example.org')).toBe(true);
        expect(OriginAllowed('https://evil.org', ['https://a.org'], 'api.example.org')).toBe(false);
        expect(OriginAllowed('https://evil.org', [], 'api.example.org')).toBe(false);
        expect(OriginAllowed('https://a.org.evil.org', ['https://a.org'], 'x')).toBe(false);
    });

    it('IsSameOrigin tolerates garbage', () => {
        expect(IsSameOrigin('not a url', 'x')).toBe(false);
        expect(IsSameOrigin('https://x', undefined)).toBe(false);
    });
});

describe('edge policy: slug and client IP', () => {
    it('rejects reserved route words and malformed slugs', () => {
        expect(IsValidSlug('2027-board-election')).toBe(true);
        expect(IsValidSlug('session')).toBe(false);
        expect(IsValidSlug('Element')).toBe(false);
        expect(IsValidSlug('')).toBe(false);
        expect(IsValidSlug('a/b')).toBe(false);
        expect(IsValidSlug("a'b")).toBe(false);
        expect(IsValidSlug('x'.repeat(101))).toBe(false);
    });

    it('ignores X-Forwarded-For unless proxy hops are configured, then takes the Nth from the right', () => {
        const req = { headers: { 'x-forwarded-for': '6.6.6.6, 1.1.1.1, 2.2.2.2' }, socket: { remoteAddress: '9.9.9.9' } };
        expect(ResolveClientIp(req, 0)).toBe('9.9.9.9');
        expect(ResolveClientIp(req, 1)).toBe('2.2.2.2');
        expect(ResolveClientIp(req, 2)).toBe('1.1.1.1');
        expect(ResolveClientIp(req, 9)).toBe('9.9.9.9');
    });
});

describe('edge policy: what the host adds before the edge', () => {
    it('strips the host CORS grant and X-Powered-By, and nothing else', () => {
        const headers = new Map<string, string>([
            ['x-powered-by', 'Express'],
            ['access-control-allow-origin', 'https://evil.example'],
            ['access-control-allow-credentials', 'true'],
            ['access-control-max-age', '86400'],
            ['vary', 'Origin'],
        ]);
        StripHostResponseHeaders({ removeHeader: (name: string) => void headers.delete(name.toLowerCase()) });
        expect([...headers.keys()]).toEqual(['vary']);
    });
});
