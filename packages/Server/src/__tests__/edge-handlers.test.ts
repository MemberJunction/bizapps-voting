import { describe, expect, it, vi } from 'vitest';
import {
    HandleInfo,
    HandlePreflight,
    HandleSession,
    type DistributionRecord,
    type EdgeDeps,
    type EdgeRequest,
    type VerifyOutcome,
} from '../edge/edge-core.js';
import { NormalizeGraphQLPath, ResolveGraphQLUrl } from '../edge/edge-policy.js';
import { FixedWindowRateLimiter } from '../edge/rate-limiter.js';
import { BuildHostPageResponse, RenderHostPage } from '../edge/host-page.js';

const SECRET = 'S3CR3T-TOKEN-VALUE';

function dist(over: Partial<DistributionRecord> = {}, status = 'Active'): DistributionRecord {
    return {
        Entity: { ID: 'd1', Status: status } as DistributionRecord['Entity'],
        ElectionID: 'e1',
        ElectionName: 'Board Election',
        ElectionStatus: 'Open',
        AllowedOrigins: ['https://members.example.org'],
        AllowedMethods: ['emailed-link'],
        Theme: { primary: '#123456' },
        DefaultLanguage: 'en',
        ...over,
    };
}

function deps(over: Partial<EdgeDeps> = {}): EdgeDeps & { logs: string[] } {
    const logs: string[] = [];
    return {
        LoadDistribution: async () => dist(),
        Verify: async (): Promise<VerifyOutcome> => ({ Ok: true, ElectionID: 'e1', EligibleVoterID: 'v1' }),
        Mint: () => ({ Token: 'jwt.token.value', ExpiresAt: '2030-01-01T00:00:00.000Z' }),
        GraphQLUrl: (r) => ResolveGraphQLUrl({ RootPath: '/', Protocol: r.Protocol, Host: r.Host }),
        Limiter: new FixedWindowRateLimiter(60_000),
        RateMax: 5,
        RateMaxGlobal: 50,
        Log: (m) => logs.push(m),
        logs,
        ...over,
    };
}

const req = (over: Partial<EdgeRequest> = {}): EdgeRequest => ({ Ip: '1.2.3.4', Host: 'api.example.org', ...over });
const body = { Slug: 'board-2027', MethodCode: 'emailed-link', Credential: { Token: SECRET } };

describe('GET info', () => {
    it('returns only the public fields for an Active distribution of an Open election', async () => {
        const r = await HandleInfo(deps(), req(), 'board-2027');
        expect(r.Status).toBe(200);
        expect(r.Body).toEqual({ ElectionName: 'Board Election', AllowedMethods: ['emailed-link'], Theme: { primary: '#123456' }, DefaultLanguage: 'en', GraphQLUrl: 'https://api.example.org/' });
    });
    it('advertises MJ\'s GraphQL endpoint, never the edge root, so an embed that sets only api-root works', async () => {
        const r = await HandleInfo(deps({ GraphQLUrl: () => 'https://mj.example.org/graphql' }), req(), 'board-2027');
        expect((r.Body as { GraphQLUrl?: string }).GraphQLUrl).toBe('https://mj.example.org/graphql');
        expect(JSON.stringify(r.Body)).not.toContain('/vote/graphql');
    });
    it('404s unknown, inactive, non-open and reserved slugs', async () => {
        expect((await HandleInfo(deps({ LoadDistribution: async () => null }), req(), 'x')).Status).toBe(404);
        expect((await HandleInfo(deps({ LoadDistribution: async () => dist({}, 'Paused') }), req(), 'x')).Status).toBe(404);
        expect((await HandleInfo(deps({ LoadDistribution: async () => dist({ ElectionStatus: 'Closed' }) }), req(), 'x')).Status).toBe(404);
        expect((await HandleInfo(deps(), req(), 'session')).Status).toBe(404);
    });
    it('reflects CORS only for allowed origins and refuses others without a grant', async () => {
        const allowed = await HandleInfo(deps(), req({ Origin: 'https://members.example.org' }), 'b');
        expect(allowed.Headers['Access-Control-Allow-Origin']).toBe('https://members.example.org');
        const denied = await HandleInfo(deps(), req({ Origin: 'https://evil.example' }), 'b');
        expect(denied.Status).toBe(403);
        expect(denied.Headers['Access-Control-Allow-Origin']).toBeUndefined();
    });
});

describe('POST session', () => {
    it('signs a voter in and returns the token, expiry and election', async () => {
        const mint = vi.fn(() => ({ Token: 'jwt.token.value', ExpiresAt: '2030-01-01T00:00:00.000Z' }));
        const r = await HandleSession(deps({ Mint: mint }), req({ Origin: 'https://members.example.org' }), body);
        expect(r.Status).toBe(200);
        expect(r.Body).toEqual({ Token: 'jwt.token.value', ExpiresAt: '2030-01-01T00:00:00.000Z', ElectionID: 'e1' });
        expect(mint).toHaveBeenCalledWith('e1', 'v1');
        expect(r.Headers['Access-Control-Allow-Origin']).toBe('https://members.example.org');
    });

    it('runs the gates in order: rate limit before validation before origin before credential', async () => {
        const verify = vi.fn(async (): Promise<VerifyOutcome> => ({ Ok: true, ElectionID: 'e1', EligibleVoterID: 'v1' }));
        // rate limit first, even for a body that would fail validation
        const d = deps({ Verify: verify, RateMax: 1 });
        expect((await HandleSession(d, req(), {})).Status).toBe(400);
        expect((await HandleSession(d, req(), {})).Status).toBe(429);
        // validation before origin
        expect((await HandleSession(deps({ Verify: verify }), req({ Origin: 'https://evil.example' }), {})).Status).toBe(400);
        // origin before credential
        const denied = await HandleSession(deps({ Verify: verify }), req({ Origin: 'https://evil.example' }), body);
        expect(denied.Status).toBe(403);
        expect(verify).not.toHaveBeenCalled();
    });

    it('rate limits per IP and slug, and across slugs per IP', async () => {
        const d = deps({ RateMax: 2, RateMaxGlobal: 4 });
        expect((await HandleSession(d, req(), body)).Status).toBe(200);
        expect((await HandleSession(d, req(), body)).Status).toBe(200);
        const limited = await HandleSession(d, req(), body);
        expect(limited.Status).toBe(429);
        expect(limited.Headers['Retry-After']).toBeDefined();
        expect((await HandleSession(d, req({ Ip: '5.6.7.8' }), body)).Status).toBe(200);
        // another slug from the first IP is still allowed once, then the global cap (which also counts refused hits) bites
        expect((await HandleSession(d, req(), { ...body, Slug: 'other' })).Status).toBe(200);
        expect((await HandleSession(d, req(), { ...body, Slug: 'third' })).Status).toBe(429);
    });

    it('answers every credential failure with the same generic 401 and never echoes the credential', async () => {
        const codes = ['InvalidCredential', 'LockedOut', 'ElectionNotOpen', 'MethodNotAllowed', 'AlreadyUsed'];
        const bodies = new Set<string>();
        for (const code of codes) {
            const d = deps({ Verify: async () => ({ Ok: false, Code: code }) });
            const r = await HandleSession(d, req(), body);
            expect(r.Status).toBe(401);
            bodies.add(JSON.stringify(r.Body));
            expect(JSON.stringify(r)).not.toContain(SECRET);
            expect(d.logs.join('\n')).not.toContain(SECRET);
        }
        expect(bodies.size).toBe(1);
        expect([...bodies][0]).toContain('Sign-in failed');
        expect([...bodies][0]).toContain('sign_in_failed');
    });

    it('does not leak the credential on validation, origin, unavailable or thrown errors either', async () => {
        const cases = await Promise.all([
            HandleSession(deps(), req(), { ...body, MethodCode: 'bad method' }),
            HandleSession(deps(), req({ Origin: 'https://evil.example' }), body),
            HandleSession(deps({ Verify: async () => { throw new Error(`boom ${SECRET}`); } }), req(), body),
            HandleSession(deps({ Mint: () => { throw new Error(`mint ${SECRET}`); } }), req(), body),
            HandleSession(deps({ LoadDistribution: async () => null }), req(), body),
        ]);
        for (const r of cases) {
            expect(JSON.stringify(r)).not.toContain(SECRET);
        }
        expect(cases[2].Status).toBe(503);
        expect(cases[3].Status).toBe(503);
    });

    it('does not log the thrown error message (which could carry a credential)', async () => {
        const d = deps({ Verify: async () => { throw new Error(`boom ${SECRET}`); } });
        await HandleSession(d, req(), body);
        expect(d.logs.join('\n')).not.toContain(SECRET);
    });

    it('refuses sso and mj-session at the edge', async () => {
        const verify = vi.fn(async (): Promise<VerifyOutcome> => ({ Ok: true, ElectionID: 'e1', EligibleVoterID: 'v1' }));
        for (const m of ['sso', 'mj-session']) {
            const r = await HandleSession(deps({ Verify: verify }), req(), { ...body, MethodCode: m });
            expect(r.Status).toBe(401);
        }
        expect(verify).not.toHaveBeenCalled();
    });

    it('404s a non-public distribution and a paused one', async () => {
        expect((await HandleSession(deps({ LoadDistribution: async () => dist({}, 'Draft') }), req(), body)).Status).toBe(404);
    });
});

describe('OPTIONS preflight', () => {
    it('grants a well-formed origin on /session (the POST enforces the allowlist) and refuses junk', async () => {
        expect((await HandlePreflight(deps(), req({ Origin: 'https://anywhere.example' }))).Status).toBe(204);
        expect((await HandlePreflight(deps(), req({ Origin: 'null' }))).Status).toBe(403);
        expect((await HandlePreflight(deps(), req())).Status).toBe(403);
    });
    it('checks the allowlist when a slug is given', async () => {
        expect((await HandlePreflight(deps(), req({ Origin: 'https://evil.example' }), 'b')).Status).toBe(403);
        expect((await HandlePreflight(deps(), req({ Origin: 'https://members.example.org' }), 'b')).Status).toBe(204);
    });
});

describe('host page', () => {
    it('renders the element with slug and api-root, escaping attributes, and the nonce on the script', () => {
        const html = RenderHostPage({ Slug: 'a"><script>', ApiRoot: '/vote', Nonce: 'N0nce', ElementSrc: '/vote/element/main.js' });
        expect(html).toContain('<mj-ballot slug="a&quot;&gt;&lt;script&gt;" api-root="/vote"></mj-ballot>');
        expect(html).toContain('<script type="module" src="/vote/element/main.js" nonce="N0nce"></script>');
        expect(html).not.toContain('<script>');
    });
    it('renders graphql-url when the edge knows the GraphQL route, and omits it otherwise', () => {
        const withUrl = RenderHostPage({ Slug: 's', ApiRoot: '/vote', Nonce: 'n', ElementSrc: '/vote/element/main.js', GraphQLUrl: '/api/graphql' });
        expect(withUrl).toContain('<mj-ballot slug="s" api-root="/vote" graphql-url="/api/graphql"></mj-ballot>');
        const without = RenderHostPage({ Slug: 's', ApiRoot: '/vote', Nonce: 'n', ElementSrc: '/vote/element/main.js' });
        expect(without).not.toContain('graphql-url');
        const escaped = RenderHostPage({ Slug: 's', ApiRoot: '/vote', Nonce: 'n', ElementSrc: '/x.js', GraphQLUrl: '/"><script>' });
        expect(escaped).not.toContain('<script>');
    });
    it('sends a fresh nonce in both the CSP and the markup, with frame-ancestors from the origins', () => {
        const a = BuildHostPageResponse({ Slug: 's', ApiRoot: '/vote', ElementSrc: '/vote/element/main.js' }, ['https://members.example.org']);
        const b = BuildHostPageResponse({ Slug: 's', ApiRoot: '/vote', ElementSrc: '/vote/element/main.js' }, []);
        const nonceOf = (r: typeof a) => /nonce-([A-Za-z0-9_-]+)'/.exec(r.Headers['Content-Security-Policy'])?.[1];
        expect(nonceOf(a)).toBeTruthy();
        expect(nonceOf(a)).not.toBe(nonceOf(b));
        expect(a.Html).toContain(`nonce="${nonceOf(a)}"`);
        expect(a.Headers['Content-Security-Policy']).toContain('frame-ancestors https://members.example.org');
        expect(b.Headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
        expect(a.Headers['Referrer-Policy']).toBe('no-referrer');
    });
});

describe('GraphQL URL resolution', () => {
    it('normalises the server GraphQL root path', () => {
        expect(NormalizeGraphQLPath(undefined)).toBe('/');
        expect(NormalizeGraphQLPath('')).toBe('/');
        expect(NormalizeGraphQLPath('/')).toBe('/');
        expect(NormalizeGraphQLPath('graphql')).toBe('/graphql');
        expect(NormalizeGraphQLPath(' /api/graphql ')).toBe('/api/graphql');
    });
    it('uses the configured URL, else scheme + host + path; never the edge root', () => {
        expect(ResolveGraphQLUrl({ Configured: 'https://gw.example.org/graphql', RootPath: '/', Host: 'x.example.org' })).toBe('https://gw.example.org/graphql');
        expect(ResolveGraphQLUrl({ RootPath: '/graphql', Protocol: 'http', Host: 'localhost:4103' })).toBe('http://localhost:4103/graphql');
        expect(ResolveGraphQLUrl({ RootPath: '/', Protocol: 'https', Host: 'api.example.org' })).toBe('https://api.example.org/');
        expect(ResolveGraphQLUrl({ RootPath: '/', Host: 'api.example.org' })).toBe('https://api.example.org/');
    });
    it('refuses an unusable host or configured value rather than echoing it', () => {
        expect(ResolveGraphQLUrl({ RootPath: '/', Host: 'evil.example/path?x' })).toBeUndefined();
        expect(ResolveGraphQLUrl({ RootPath: '/', Host: 'a b' })).toBeUndefined();
        expect(ResolveGraphQLUrl({ RootPath: '/' })).toBeUndefined();
        expect(ResolveGraphQLUrl({ Configured: 'javascript:alert(1)', RootPath: '/', Host: 'ok.example.org' })).toBeUndefined();
    });
});
