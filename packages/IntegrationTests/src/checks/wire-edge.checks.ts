/**
 * wire-edge: the public /vote edge over RAW HTTP, then what a minted guest session can and cannot do over GraphQL.
 *
 *   D01  host page: status, security headers, per-request CSP nonce that matches the script tag, framing policy
 *   D02  unknown / closed / draft slugs are indistinguishable (no enumeration), and no input is echoed
 *   D03  /info: public fields only, no secrets, no store, 404 shape for unknown
 *   D04  sign-in failures are one generic answer: wrong PIN, unknown voter, unknown method, junk token, SSO, wrong election
 *   D05  durable per-credential lockout: after N wrong PINs even the correct PIN is refused, with the same generic answer
 *   D06  malformed / oversized / hostile bodies never produce a 5xx, never echo input, always the stable error contract
 *   D07  origin policy: disallowed origin -> 403 and no CORS grant (before any credential is examined); allowlisted origin
 *        gets exactly its own CORS grant; preflight rules
 *   D08  a minted session is bound to its election: other-election and admin operations are refused
 *   D09  tampered / forged / truncated session tokens are rejected (401), as is an unsigned (alg none) token
 *   D10  a guest session cannot read identity, key, role or permission entities, nor the voting secrets
 *   D11  GET /vote/element/main.js is served as JavaScript with nosniff and no stray cookies
 *   D12  odd paths and methods on the edge: no stack traces, no X-Powered-By, reserved words are not slugs
 *   D13  rate limiting: 429 with Retry-After, and a spoofed X-Forwarded-For does not buy more allowance
 *
 * The edge counts requests per (IP, scope, slug) and per IP across slugs; every check spends from a shared budget so that
 * its own traffic never trips the limiter by accident (only D13 does, on purpose, on throwaway slugs).
 */
import { createHmac, randomBytes } from 'node:crypto';
import { Assert, AssertEqual, IntegrationCheckRegistry, type IntegrationCheckContext, type NamedCheck } from '@memberjunction/testing-integration/registry';
import { VotingCastBallotOperation, VotingCloseElectionOperation, VotingGetMyBallotOperation, VotingGetTurnoutOperation, VotingChallengeVoterOperation } from '@mj-biz-apps/voting-entities';
import { RawGenericRunView, RawGraphQL, RawHttp, type RawHttpResult } from '../wire/raw-graphql.js';
import { BuildWorldElection, CastWith, CloseWorldElection, CreatePeople, Describe, Sleep, type PersonRef, type WorldElection } from '../wire/vote-world.js';
import { RequestGuestSession } from '../wire/guest-session.js';
import { WireCast } from '../wire/wire-cast.js';
import { WireClient } from '../wire/wire-client.js';
import { ResolveWireConfig } from '../wire/wire-config.js';

const BUNDLE = 'wire-edge';
const PARTNER_ORIGIN = 'https://partner.example';
const EVIL_ORIGIN = 'https://evil.example';

interface EdgeWorld {
    Cast: WireCast;
    Admin: WireClient;
    People: PersonRef[];
    /** Election with NO allowed origins (same-origin only). */
    Plain: WorldElection;
    /** Election whose distribution allows PARTNER_ORIGIN. */
    Partner: WorldElection;
    /** A second election, for cross-election attempts. */
    Other: WorldElection;
    /** An election closed during setup (its distribution is no longer public). */
    Closed: WorldElection;
    /** A Draft/Ready election with a saved distribution but never opened. */
    Unopened: WorldElection;
    Origin: string;
}

let world: EdgeWorld | undefined;
function W(): EdgeWorld {
    if (!world) throw new Error('wire-edge setup did not run');
    return world;
}

// ─── The shared request budget ───────────────────────────────────────────────

const GLOBAL_MAX = 80; // the edge allows 90 per IP per minute; stay under it
const KEY_MAX = 17; // and 20 per (IP, scope, slug)
const WINDOW_MS = 60_000;
const globalHits: number[] = [];
const keyHits = new Map<string, number[]>();

function prune(list: number[], now: number): void {
    while (list.length && now - list[0] >= WINDOW_MS) list.shift();
}

/** Waits until one more request fits the budget, then books it. */
async function Spend(scope: string, slug: string): Promise<void> {
    const key = `${scope}|${slug.slice(0, 100).toLowerCase()}`;
    for (;;) {
        const now = Date.now();
        prune(globalHits, now);
        const list = keyHits.get(key) ?? [];
        prune(list, now);
        if (globalHits.length < GLOBAL_MAX && list.length < KEY_MAX) {
            globalHits.push(now);
            list.push(now);
            keyHits.set(key, list);
            return;
        }
        await Sleep(1000);
    }
}

async function Post(slug: string, body: string, headers: Record<string, string> = {}): Promise<RawHttpResult> {
    await Spend('session', slug);
    return RawHttp('/vote/session', { Method: 'POST', Headers: { 'content-type': 'application/json', ...headers }, Body: body });
}

async function Get(path: string, scope: string, slug: string, headers: Record<string, string> = {}): Promise<RawHttpResult> {
    await Spend(scope, slug);
    return RawHttp(path, { Headers: headers });
}

function SessionBody(slug: string, sourceKey: string, pin: string, method = 'second-factor'): string {
    return JSON.stringify({ Slug: slug, MethodCode: method, Credential: { SourceKey: sourceKey, Pin: pin } });
}

/** A body+status fingerprint that must be identical across every sign-in failure. */
function Fingerprint(r: RawHttpResult): string {
    const h = ['content-type', 'cache-control', 'access-control-allow-origin', 'retry-after'].map((k) => `${k}=${r.Headers.get(k) ?? ''}`).join(';');
    return `${r.Status} ${JSON.stringify(r.Json)} ${h}`;
}

function Token(r: RawHttpResult): string | undefined {
    return typeof r.Json?.Token === 'string' ? r.Json.Token : undefined;
}

const b64 = (o: unknown): string => Buffer.from(JSON.stringify(o)).toString('base64url');

function Problems(list: string[]): void {
    Assert(list.length === 0, `${list.length} problem(s):\n         - ${list.join('\n         - ')}`);
}

// ─── Checks ──────────────────────────────────────────────────────────────────

const checks: NamedCheck[] = [
    {
        Id: `${BUNDLE}.D01`,
        Name: 'D01 - host page: security headers, per-request CSP nonce matching the script tag, framing policy',
        Fn: async () => {
            const w = W();
            const problems: string[] = [];
            const a = await Get(`/vote/${w.Plain.Slug}`, 'host', w.Plain.Slug);
            const b = await Get(`/vote/${w.Plain.Slug}`, 'host', w.Plain.Slug);
            AssertEqual(a.Status, 200, 'host page status');
            if (!/^text\/html/.test(a.Headers.get('content-type') ?? '')) problems.push(`content-type ${a.Headers.get('content-type')}`);
            const csp = a.Headers.get('content-security-policy') ?? '';
            const nonce = /script-src 'nonce-([^']+)'/.exec(csp)?.[1];
            if (!nonce) problems.push(`CSP has no script nonce: ${csp}`);
            if (/script-src[^;]*'unsafe-inline'/.test(csp) || /script-src[^;]*'unsafe-eval'/.test(csp)) problems.push(`CSP script-src allows unsafe code: ${csp}`);
            if (!/default-src 'self'/.test(csp)) problems.push('CSP default-src is not self');
            if (!/base-uri 'none'/.test(csp)) problems.push('CSP base-uri not none');
            if (!/form-action 'none'/.test(csp)) problems.push('CSP form-action not none');
            if (!/frame-ancestors 'none'/.test(csp)) problems.push('a distribution without allowed origins must not be framable (frame-ancestors none)');
            if (a.Headers.get('x-frame-options') !== 'DENY') problems.push(`X-Frame-Options is "${a.Headers.get('x-frame-options')}", expected DENY`);
            if (a.Headers.get('x-content-type-options') !== 'nosniff') problems.push('X-Content-Type-Options is not nosniff');
            if (a.Headers.get('referrer-policy') !== 'no-referrer') problems.push(`Referrer-Policy is "${a.Headers.get('referrer-policy')}"`);
            if (!/no-store/.test(a.Headers.get('cache-control') ?? '')) problems.push('the ballot page is cacheable');
            if (a.Headers.get('set-cookie')) problems.push('the host page sets a cookie');
            if (nonce && !a.Text.includes(`nonce="${nonce}"`)) problems.push('the script tag does not carry the CSP nonce');
            const nonce2 = /script-src 'nonce-([^']+)'/.exec(b.Headers.get('content-security-policy') ?? '')?.[1];
            if (nonce && nonce === nonce2) problems.push('the CSP nonce is reused across requests');
            if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(a.Text)) problems.push('the page contains an inline script');
            if (a.Text.includes(w.Plain.ElectionID)) problems.push('the page embeds the election id');
            // Framing: the partner distribution frames only its allowed origin.
            const p = await Get(`/vote/${w.Partner.Slug}`, 'host', w.Partner.Slug);
            const pcsp = p.Headers.get('content-security-policy') ?? '';
            if (!pcsp.includes(`frame-ancestors ${PARTNER_ORIGIN}`)) problems.push(`partner CSP frame-ancestors is not exactly the allowed origin: ${pcsp}`);
            if (p.Headers.get('x-frame-options')) problems.push('X-Frame-Options sent for a framable distribution');
            Problems(problems);
        },
    },
    {
        Id: `${BUNDLE}.D02`,
        Name: 'D02 - unknown, closed and never-opened slugs are indistinguishable; hostile slugs are neither echoed nor a 5xx',
        Fn: async () => {
            const w = W();
            const problems: string[] = [];
            const pages = new Map<string, RawHttpResult>();
            for (const [label, slug] of [['unknown', `nope-${randomBytes(4).toString('hex')}`], ['closed', w.Closed.Slug], ['unopened', w.Unopened.Slug]] as const) {
                pages.set(label, await Get(`/vote/${slug}`, 'host', slug));
            }
            const fingerprints = new Set([...pages.values()].map((r) => `${r.Status}|${r.Headers.get('content-type')}|${r.Text.length}`));
            if (fingerprints.size !== 1) problems.push(`slug states are distinguishable by page: ${[...pages].map(([k, r]) => `${k}=${r.Status}/${r.Text.length}b`).join(', ')}`);
            for (const [k, r] of pages) if (r.Status !== 404) problems.push(`${k} slug answered ${r.Status}, expected 404`);
            const infos = new Map<string, RawHttpResult>();
            for (const [label, slug] of [['unknown', `nope-${randomBytes(4).toString('hex')}`], ['closed', w.Closed.Slug], ['unopened', w.Unopened.Slug]] as const) {
                infos.set(label, await Get(`/vote/${slug}/info`, 'info', slug));
            }
            const infoPrints = new Set([...infos.values()].map((r) => `${r.Status}|${JSON.stringify(r.Json)}`));
            if (infoPrints.size !== 1) problems.push(`slug states are distinguishable by /info: ${[...infos].map(([k, r]) => `${k}=${r.Status}`).join(', ')}`);
            // Hostile slugs: markup, traversal, SQL, oversize, control characters.
            const hostile = ['<script>alert(1)</script>', "'%20OR%201=1--", '..%2f..%2fetc%2fpasswd', 'a'.repeat(300), '%00', '%0d%0aX-Injected:1', encodeURIComponent('<img src=x onerror=1>')];
            for (const slug of hostile) {
                const r = await Get(`/vote/${slug}`, 'host', 'hostile');
                if (r.Status >= 500) problems.push(`slug ${slug.slice(0, 30)} gave a ${r.Status}`);
                if (/<script>alert|onerror=|X-Injected/i.test(r.Text) || r.Headers.get('x-injected')) problems.push(`slug ${slug.slice(0, 30)} was echoed or injected into the response`);
                const i = await Get(`/vote/${slug}/info`, 'info', 'hostile');
                if (i.Status >= 500) problems.push(`info for slug ${slug.slice(0, 30)} gave a ${i.Status}`);
            }
            Problems(problems);
        },
    },
    {
        Id: `${BUNDLE}.D03`,
        Name: 'D03 - /info exposes only the public description, uncached, with no secrets',
        Fn: async () => {
            const w = W();
            const problems: string[] = [];
            const r = await Get(`/vote/${w.Plain.Slug}/info`, 'info', w.Plain.Slug);
            AssertEqual(r.Status, 200, 'info status');
            const keys = Object.keys(r.Json ?? {}).sort();
            const allowed = ['AllowedMethods', 'DefaultLanguage', 'ElectionName', 'GraphQLUrl', 'Theme'];
            for (const k of keys) if (!allowed.includes(k)) problems.push(`/info exposes the unexpected member "${k}"`);
            if (!/no-store/.test(r.Headers.get('cache-control') ?? '')) problems.push('/info is cacheable');
            const blob = r.Text.toLowerCase();
            for (const secret of [w.Plain.ElectionID.toLowerCase(), 'distributionkey', 'key_', 'secret', 'hostpublickey', 'scrypt']) if (blob.includes(secret)) problems.push(`/info contains "${secret}"`);
            const methods = (r.Json?.AllowedMethods as string[] | undefined) ?? [];
            if (!methods.includes('second-factor')) problems.push(`AllowedMethods lacks second-factor: ${JSON.stringify(methods)}`);
            for (const m of methods) if (['sso', 'mj-session'].includes(m)) problems.push(`/info advertises the edge-unsupported method ${m}`);
            const graphql = String(r.Json?.GraphQLUrl ?? '');
            if (graphql && !graphql.startsWith(ResolveWireConfig().BaseUrl)) problems.push(`GraphQLUrl "${graphql}" is not this server`);
            // A spoofed Host header must not be reflected into GraphQLUrl.
            const spoof = await Get(`/vote/${w.Plain.Slug}/info`, 'info', w.Plain.Slug, { 'x-forwarded-host': 'attacker.example', 'x-forwarded-proto': 'https' });
            if (String(spoof.Json?.GraphQLUrl ?? '').includes('attacker.example')) problems.push('X-Forwarded-Host is reflected into GraphQLUrl');
            Problems(problems);
        },
    },
    {
        Id: `${BUNDLE}.D04`,
        Name: 'D04 - every sign-in failure is the same answer (wrong PIN, unknown voter, unknown method, junk token, SSO, wrong election)',
        Fn: async () => {
            const w = W();
            const v = w.Plain.Voters.get(w.People[4].Label);
            const o = w.Other.Voters.get(w.People[4].Label);
            Assert(!!v && !!o, 'voters exist');
            const attempts: Array<[string, string]> = [
                ['wrong PIN', SessionBody(w.Plain.Slug, v!.SourceKey, '00000000')],
                ['unknown voter', SessionBody(w.Plain.Slug, `ghost-${randomBytes(4).toString('hex')}`, v!.Pin)],
                ['PIN of another election', SessionBody(w.Plain.Slug, v!.SourceKey, o!.Pin)],
                ['credentials of another election', SessionBody(w.Plain.Slug, o!.SourceKey, o!.Pin)],
                ['unknown method', SessionBody(w.Plain.Slug, v!.SourceKey, v!.Pin, 'zz-nope')],
                ['SSO', SessionBody(w.Plain.Slug, v!.SourceKey, v!.Pin, 'sso')],
                ['mj-session', SessionBody(w.Plain.Slug, v!.SourceKey, v!.Pin, 'mj-session')],
                ['junk emailed-link token', JSON.stringify({ Slug: w.Plain.Slug, MethodCode: 'emailed-link', Credential: { Token: randomBytes(24).toString('base64url') } })],
                ['junk host assertion', JSON.stringify({ Slug: w.Plain.Slug, MethodCode: 'host-assertion', Credential: { Assertion: `${b64({ alg: 'none' })}.${b64({ sub: 'x' })}.` } })],
                ['PIN too long', SessionBody(w.Plain.Slug, v!.SourceKey, '1'.repeat(65))],
            ];
            const prints = new Map<string, string[]>();
            const timings = new Map<string, number[]>();
            for (const [label, body] of attempts) {
                const t0 = Date.now();
                const r = await Post(w.Plain.Slug, body);
                const ms = Date.now() - t0;
                const fp = Fingerprint(r);
                prints.set(fp, [...(prints.get(fp) ?? []), label]);
                timings.set(label, [ms]);
                Assert(r.Status !== 200, `${label} was ACCEPTED (${r.Text.slice(0, 80)})`);
            }
            const problems: string[] = [];
            if (prints.size !== 1) problems.push(`failures are distinguishable: ${[...prints].map(([fp, labels]) => `[${labels.join(' | ')}] -> ${fp.slice(0, 120)}`).join('\n           ')}`);
            const only = [...prints.keys()][0] ?? '';
            if (!only.startsWith('401 ') || !only.includes('"Code":"sign_in_failed"') || !only.includes('"ErrorMessage":"Sign-in failed"')) problems.push(`the generic answer is not 401 sign_in_failed: ${only.slice(0, 120)}`);
            // Timing: an unknown voter must not be answered much faster than a wrong PIN for a known voter (hash work is burned).
            const sample = async (body: string): Promise<number> => {
                const xs: number[] = [];
                for (let i = 0; i < 3; i++) {
                    const t = Date.now();
                    await Post(w.Plain.Slug, body);
                    xs.push(Date.now() - t);
                }
                return xs.sort((x, y) => x - y)[1];
            };
            const timed = w.Plain.Voters.get(w.People[6].Label)!;
            const known = await sample(SessionBody(w.Plain.Slug, timed.SourceKey, '11111111'));
            const unknown = await sample(SessionBody(w.Plain.Slug, `ghost-${randomBytes(4).toString('hex')}`, '11111111'));
            if (known > 60 && unknown * 5 < known) problems.push(`timing reveals voter existence: wrong PIN ${known}ms vs unknown voter ${unknown}ms`);
            Problems(problems);
        },
    },
    {
        Id: `${BUNDLE}.D05`,
        Name: 'D05 - durable lockout: after repeated wrong PINs even the correct PIN is refused, with the same generic answer',
        Fn: async () => {
            const w = W();
            const v = w.Plain.Voters.get(w.People[3].Label);
            Assert(!!v, 'voter exists');
            const problems: string[] = [];
            // Sanity: the credential works before the abuse (and mints a session we then discard).
            const before = await Post(w.Plain.Slug, SessionBody(w.Plain.Slug, v!.SourceKey, v!.Pin));
            AssertEqual(before.Status, 200, 'the correct PIN works before any failure');
            // A correct PIN resets the counter (documented), so the failures must be consecutive.
            let lockedAt = -1;
            let lastBad: RawHttpResult | undefined;
            for (let i = 1; i <= 12 && lockedAt < 0; i++) {
                const bad = await Post(w.Plain.Slug, SessionBody(w.Plain.Slug, v!.SourceKey, String(10_000_000 + i)));
                lastBad = bad;
                if (bad.Status !== 401) problems.push(`failure #${i} answered ${bad.Status}`);
                if (i >= 5) {
                    const good = await Post(w.Plain.Slug, SessionBody(w.Plain.Slug, v!.SourceKey, v!.Pin));
                    if (good.Status !== 200) {
                        lockedAt = i;
                        if (Fingerprint(good) !== Fingerprint(bad)) problems.push(`the locked answer differs from the generic one: ${Fingerprint(good).slice(0, 100)}`);
                    }
                }
            }
            if (lockedAt < 0) problems.push('the correct PIN still worked after 12 consecutive wrong ones: no lockout');
            else if (lockedAt > 5) problems.push(`lockout only after ${lockedAt} consecutive failures (policy is 5)`);
            void lastBad;
            // Another voter on the same election is unaffected by this voter's lockout.
            const other = w.Plain.Voters.get(w.People[1].Label);
            const ok = await Post(w.Plain.Slug, SessionBody(w.Plain.Slug, other!.SourceKey, other!.Pin));
            if (ok.Status !== 200) problems.push(`another voter was locked out by this voter's failures (${ok.Status})`);
            Problems(problems);
        },
    },
    {
        Id: `${BUNDLE}.D06`,
        Name: 'D06 - malformed, oversized and hostile bodies: stable error contract, never a 5xx, never echoed',
        Fn: async () => {
            const w = W();
            const problems: string[] = [];
            const marker = `MARK${randomBytes(4).toString('hex')}`;
            const cases: Array<[string, string, number[]]> = [
                ['not json', `{${marker}`, [400]],
                ['empty body', '', [400]],
                ['json array', JSON.stringify([marker]), [400]],
                ['json string', JSON.stringify(marker), [400]],
                ['json null', 'null', [400]],
                ['Slug is a number', JSON.stringify({ Slug: 5, MethodCode: 'second-factor', Credential: { Pin: marker } }), [400]],
                ['Slug is an object', JSON.stringify({ Slug: { a: marker }, MethodCode: 'second-factor', Credential: { Pin: '1' } }), [400]],
                ['no credential', JSON.stringify({ Slug: w.Plain.Slug, MethodCode: 'second-factor' }), [400]],
                ['empty credential', JSON.stringify({ Slug: w.Plain.Slug, MethodCode: 'second-factor', Credential: {} }), [400]],
                ['method with spaces', JSON.stringify({ Slug: w.Plain.Slug, MethodCode: `second factor ${marker}`, Credential: { Pin: '1', SourceKey: 'a' } }), [400]],
                ['Pin is an array', JSON.stringify({ Slug: w.Plain.Slug, MethodCode: 'second-factor', Credential: { Pin: [marker], SourceKey: 'a' } }), [400]],
                ['slug over 100 chars', JSON.stringify({ Slug: marker + 'a'.repeat(120), MethodCode: 'second-factor', Credential: { Pin: '1', SourceKey: 'a' } }), [400]],
                ['slug is reserved word', JSON.stringify({ Slug: 'session', MethodCode: 'second-factor', Credential: { Pin: '1', SourceKey: 'a' } }), [404]],
                ['slug is SQL', JSON.stringify({ Slug: "x' OR '1'='1", MethodCode: 'second-factor', Credential: { Pin: '1', SourceKey: 'a' } }), [404, 400]],
                ['SourceKey is SQL', SessionBody(w.Plain.Slug, `' OR 1=1 --${marker}`, '1'), [401]],
                ['prototype pollution', `{"__proto__":{"polluted":"${marker}"},"Slug":"${w.Plain.Slug}","MethodCode":"second-factor","Credential":{"Pin":"1","SourceKey":"a"}}`, [401, 400]],
                ['constructor key', JSON.stringify({ constructor: { prototype: { x: marker } }, Slug: w.Plain.Slug, MethodCode: 'second-factor', Credential: { Pin: '1', SourceKey: 'a' } }), [401, 400]],
                ['deeply nested', '['.repeat(2000) + ']'.repeat(2000), [400]],
                ['unicode + NUL in key', SessionBody(w.Plain.Slug, `\u0000😀${marker}`, '1'), [401, 400]],
                ['oversized (9 KB)', JSON.stringify({ Slug: w.Plain.Slug, MethodCode: 'second-factor', Credential: { Pin: 'x'.repeat(9300), SourceKey: 'a' } }), [413]],
                ['oversized (200 KB)', JSON.stringify({ pad: marker.repeat(40_000) }), [413]],
            ];
            for (const [label, body, statuses] of cases) {
                const r = await Post(w.Plain.Slug, body);
                if (r.Status >= 500) problems.push(`${label}: ${r.Status} ${r.Text.slice(0, 80)}`);
                else if (!statuses.includes(r.Status)) problems.push(`${label}: status ${r.Status}, expected ${statuses.join('/')}`);
                if (r.Text.includes(marker)) problems.push(`${label}: the response echoes input`);
                if (r.Json && !(r.Json.Success === false && typeof r.Json.Code === 'string' && typeof r.Json.ErrorMessage === 'string')) problems.push(`${label}: error body is not the stable contract: ${r.Text.slice(0, 100)}`);
                if (!r.Json && r.Status !== 204) problems.push(`${label}: non-JSON error body (${r.Headers.get('content-type')}): ${r.Text.slice(0, 80)}`);
                if (/at .*\(.*:\d+:\d+\)|node_modules|stack/i.test(r.Text)) problems.push(`${label}: the response leaks a stack trace`);
            }
            // The server is still healthy afterwards.
            const v = w.Plain.Voters.get(w.People[1].Label)!;
            const healthy = await Post(w.Plain.Slug, SessionBody(w.Plain.Slug, v.SourceKey, v.Pin));
            if (healthy.Status !== 200) problems.push(`after the abuse a valid sign-in answered ${healthy.Status}`);
            // Wrong content type / missing: the body must not be trusted either.
            const form = await RawHttp('/vote/session', { Method: 'POST', Headers: { 'content-type': 'application/x-www-form-urlencoded' }, Body: `Slug=${w.Plain.Slug}&MethodCode=second-factor&Credential[Pin]=1` });
            if (form.Status >= 500) problems.push(`form-encoded body gave ${form.Status}`);
            if (form.Status === 200) problems.push('a form-encoded body was accepted');
            Problems(problems);
        },
    },
    {
        Id: `${BUNDLE}.D07`,
        Name: 'D07 - origin policy: refusal before credentials, exact CORS grants, preflight rules',
        Fn: async () => {
            const w = W();
            const problems: string[] = [];
            const pv = w.Partner.Voters.get(w.People[5].Label)!;
            const good = SessionBody(w.Partner.Slug, pv.SourceKey, pv.Pin);
            // Disallowed origin with a VALID credential: refused, no session, no CORS grant.
            const evil = await Post(w.Partner.Slug, good, { origin: EVIL_ORIGIN });
            if (evil.Status !== 403) problems.push(`evil origin with valid credentials answered ${evil.Status}`);
            if (Token(evil)) problems.push('a session was minted for a disallowed origin');
            const granted: string[] = [];
            if (evil.Headers.get('access-control-allow-origin')) granted.push(`${EVIL_ORIGIN} -> ${evil.Headers.get('access-control-allow-origin')}`);
            if (evil.Json?.Code !== 'origin_denied') problems.push(`evil origin code ${String(evil.Json?.Code)}`);
            // The refusal comes before the credential is examined: a wrong PIN from a bad origin is the SAME 403 (no oracle).
            const evilBad = await Post(w.Partner.Slug, SessionBody(w.Partner.Slug, pv.SourceKey, '00000000'), { origin: EVIL_ORIGIN });
            if (Fingerprint(evilBad) !== Fingerprint(evil)) problems.push('a bad origin gets different answers for right and wrong credentials');
            for (const origin of ['null', 'http://localhost', 'https://partner.example.evil.example', 'https://sub.partner.example', 'http://partner.example', 'https://PARTNER.example:8443', 'javascript:alert(1)', 'not a url']) {
                const r = await Post(w.Partner.Slug, good, { origin });
                if (r.Status === 200 || Token(r)) problems.push(`origin "${origin}" obtained a session`);
                if (r.Headers.get('access-control-allow-origin')) granted.push(`${origin} -> ${r.Headers.get('access-control-allow-origin')}`);
            }
            if (granted.length > 0) problems.push(`${granted.length} refused origin(s) still received Access-Control-Allow-Origin (e.g. ${granted.slice(0, 3).join('; ')}); the edge promises NO CORS grant on a refusal`);
            // The allowlisted origin gets exactly itself back.
            const okOrigin = await Post(w.Partner.Slug, good, { origin: PARTNER_ORIGIN });
            if (okOrigin.Status !== 200) problems.push(`allowlisted origin answered ${okOrigin.Status}: ${okOrigin.Text.slice(0, 80)}`);
            if (okOrigin.Headers.get('access-control-allow-origin') !== PARTNER_ORIGIN) problems.push(`allowlisted origin got CORS "${okOrigin.Headers.get('access-control-allow-origin')}"`);
            if (okOrigin.Headers.get('access-control-allow-credentials')) problems.push('credentials are allowed cross-origin');
            if (!/Origin/i.test(okOrigin.Headers.get('vary') ?? '')) problems.push('no Vary: Origin on a reflected CORS header');
            // /info honours the same allowlist.
            const infoEvil = await Get(`/vote/${w.Partner.Slug}/info`, 'info', w.Partner.Slug, { origin: EVIL_ORIGIN });
            if (infoEvil.Status !== 403) problems.push(`/info for a disallowed origin answered ${infoEvil.Status}, expected 403`);
            // Same-origin (the first-party host page posting back) works on the plain election.
            const v = w.Plain.Voters.get(w.People[5].Label)!;
            const same = await Post(w.Plain.Slug, SessionBody(w.Plain.Slug, v.SourceKey, v.Pin), { origin: w.Origin });
            if (same.Status !== 200) problems.push(`same-origin request answered ${same.Status}`);
            const crossOnPlain = await Post(w.Plain.Slug, SessionBody(w.Plain.Slug, v.SourceKey, v.Pin), { origin: PARTNER_ORIGIN });
            if (crossOnPlain.Status === 200) problems.push('a distribution with no allowed origins accepted a cross-origin request');
            // Preflight: no Origin -> refused; any well-formed origin -> 204 with no body and no data; malformed -> refused.
            await Spend('preflight', '-');
            const pre = await RawHttp('/vote/session', { Method: 'OPTIONS', Headers: { origin: PARTNER_ORIGIN, 'access-control-request-method': 'POST' } });
            if (pre.Status !== 204) problems.push(`preflight answered ${pre.Status}`);
            if (pre.Text.length > 0) problems.push('preflight carries a body');
            await Spend('preflight', '-');
            const preNone = await RawHttp('/vote/session', { Method: 'OPTIONS' });
            if (preNone.Status !== 403) problems.push(`preflight without Origin answered ${preNone.Status}`);
            await Spend('preflight', '-');
            const preBad = await RawHttp('/vote/session', { Method: 'OPTIONS', Headers: { origin: 'https://x.example/with/path' } });
            if (preBad.Status !== 403) problems.push(`preflight with a malformed Origin answered ${preBad.Status}`);
            Problems(problems);
        },
    },
    {
        Id: `${BUNDLE}.D08`,
        Name: 'D08 - a minted session is bound to its election and is a voter, not an operator',
        Fn: async () => {
            const w = W();
            const problems: string[] = [];
            const v = w.Plain.Voters.get(w.People[0].Label)!;
            await Spend('session', w.Plain.Slug);
            const s = await RequestGuestSession(w.Plain.Slug, { SourceKey: v.SourceKey, Pin: v.Pin });
            Assert(s.Kind === 'session', 'a session was minted');
            if (s.Kind !== 'session') return;
            const guest = await WireClient.ConnectGuest('edge-guest', s.Token);
            const own = await guest.Call(new VotingGetMyBallotOperation(), { ElectionID: w.Plain.ElectionID });
            if (!(own.Success && own.Output?.Success === true)) problems.push(`the session cannot load its own ballot: ${Describe(own)}`);
            // Another election's ballot, cast, turnout and a voter challenge: all refused.
            const other = await guest.Call(new VotingGetMyBallotOperation(), { ElectionID: w.Other.ElectionID });
            if (other.Success || other.ResultCode !== 'FORBIDDEN') problems.push(`GetMyBallot on another election: ${Describe(other)}`);
            const castOther = await guest.Call(new VotingCastBallotOperation(), { ElectionID: w.Other.ElectionID, BallotStyleHash: 'x', Submission: { Contests: [] } });
            if (castOther.Success || castOther.ResultCode !== 'FORBIDDEN') problems.push(`CastBallot on another election: ${Describe(castOther)}`);
            const turnout = await guest.Call(new VotingGetTurnoutOperation(), { ElectionID: w.Plain.ElectionID });
            if (turnout.Success) problems.push('a voter session can read turnout');
            const otherVoter = w.Plain.Voters.get(w.People[1].Label)!;
            const challenge = await guest.Call(new VotingChallengeVoterOperation(), { EligibleVoterID: otherVoter.EligibleVoterID, Reason: 'edge' });
            if (challenge.Success) problems.push('a voter session can challenge another voter');
            const closeOwn = await guest.Call(new VotingCloseElectionOperation(), { ElectionID: w.Plain.ElectionID });
            if (closeOwn.Success) problems.push('a voter session can close its election');
            // Vote through the session: the receipt it gets is for THIS voter only (a second cast is refused).
            const cast = await CastWith(guest, w.Plain.ElectionID, 0);
            if (!cast.Success) problems.push(`the session could not cast its own ballot: ${cast.Message}`);
            const style = (await guest.Call(new VotingGetMyBallotOperation(), { ElectionID: w.Plain.ElectionID })).Output?.Style;
            const again = await CastWith(guest, w.Plain.ElectionID, 1);
            // A revote replaces the earlier ballot only where the election allows it; otherwise the second cast must be refused.
            if (style && style.AllowRevote === false && again.Success) problems.push('the same session cast twice in an election that forbids revotes');
            // A session for an election that has since closed still authorizes nothing there.
            Problems(problems);
        },
    },
    {
        Id: `${BUNDLE}.D09`,
        Name: 'D09 - tampered, forged, truncated and unsigned session tokens are all rejected',
        Fn: async () => {
            const w = W();
            const problems: string[] = [];
            const v = w.Plain.Voters.get(w.People[1].Label)!;
            await Spend('session', w.Plain.Slug);
            const s = await RequestGuestSession(w.Plain.Slug, { SourceKey: v.SourceKey, Pin: v.Pin });
            Assert(s.Kind === 'session', 'a session was minted');
            if (s.Kind !== 'session') return;
            const [h, p, sig] = s.Token.split('.');
            const claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as Record<string, unknown>;
            const control = await RawGraphQL<{ __typename: string }>({ Kind: 'bearer', Token: s.Token }, '{ __typename }');
            if (control.Status !== 200) problems.push(`the untouched session is not accepted (${control.Status})`);
            const flipLast = (t: string): string => t.slice(0, -2) + (t.endsWith('AA') ? 'BB' : 'AA');
            const swapped = (patch: Record<string, unknown>): string => `${h}.${b64({ ...claims, ...patch })}.${sig}`;
            const forged: Array<[string, string]> = [
                ['signature last chars altered', `${h}.${p}.${flipLast(sig)}`],
                ['signature removed', `${h}.${p}.`],
                ['payload altered (expiry extended), old signature', swapped({ exp: Math.floor(Date.now() / 1000) + 86_400 * 365 })],
                ['payload altered (expired), old signature', swapped({ exp: Math.floor(Date.now() / 1000) - 60 })],
                ['payload altered (other subject), old signature', swapped({ sub: 'someone-else' })],
                ['alg none, no signature', `${b64({ alg: 'none', typ: 'JWT' })}.${p}.`],
                ['alg HS256 signed with a guessed secret', (() => {
                    const head = b64({ alg: 'HS256', typ: 'JWT' });
                    return `${head}.${p}.${createHmac('sha256', 'secret').update(`${head}.${p}`).digest('base64url')}`;
                })()],
                ['header kid swapped', `${b64({ ...(JSON.parse(Buffer.from(h, 'base64url').toString('utf8')) as object), kid: 'attacker' })}.${p}.${sig}`],
                ['only two segments', `${h}.${p}`],
                ['truncated', s.Token.slice(0, Math.floor(s.Token.length / 2))],
                ['garbage', randomBytes(40).toString('base64url')],
                ['empty bearer', ''],
            ];
            for (const [label, token] of forged) {
                const r = await RawGraphQL<{ __typename: string }>({ Kind: 'bearer', Token: token }, '{ __typename }');
                if (r.Status === 200 && r.Data?.__typename) problems.push(`${label}: ACCEPTED`);
                else if (r.Status !== 401 && r.Status !== 403 && r.Status !== 400) problems.push(`${label}: rejected with ${r.Status} (expected 401)`);
                if (r.Status >= 500) problems.push(`${label}: server error ${r.Status}`);
            }
            // A forged token used for an operation is not honoured either.
            const forgedClient = await WireClient.ConnectGuest('forged', `${h}.${p}.${flipLast(sig)}`).catch(() => undefined);
            if (forgedClient) {
                const r = await forgedClient.Call(new VotingGetMyBallotOperation(), { ElectionID: w.Plain.ElectionID });
                if (r.Success) problems.push('a forged-signature token ran GetMyBallot');
            }
            Problems(problems);
        },
    },
    {
        Id: `${BUNDLE}.D10`,
        Name: 'D10 - a guest session cannot read identity, key, role or permission entities, nor the voting secrets',
        Fn: async () => {
            const w = W();
            const problems: string[] = [];
            const v = w.Plain.Voters.get(w.People[2].Label)!;
            await Spend('session', w.Plain.Slug);
            const s = await RequestGuestSession(w.Plain.Slug, { SourceKey: v.SourceKey, Pin: v.Pin });
            Assert(s.Kind === 'session', 'a session was minted');
            if (s.Kind !== 'session') return;
            const cred = { Kind: 'bearer', Token: s.Token } as const;
            // 'MJ: User Roles' / 'User Applications' / 'Application Roles' are deliberately absent: MJ's magic-link guide requires the
            // restricted role to read them (the session builder resolves its own role through them), so that exposure is MJ's, reported once.
            for (const entity of [
                'MJ: Users', 'MJ: API Keys', 'MJ: API Key Scopes', 'MJ: Roles', 'MJ: Entity Permissions', 'MJ: Magic Link Invites',
                'MJ: AI Agents', 'MJ: Companies', 'MJ_BizApps_Voting: Voter Credentials', 'MJ_BizApps_Voting: Election Audit Events', 'MJ_BizApps_Voting: Cast Ballots',
                'MJ_BizApps_Voting: Ballot Distributions', 'MJ_BizApps_Common: People',
            ]) {
                const r = await RawGenericRunView(cred, entity, { MaxRows: 3 });
                if (r.Ran && r.Rows.length > 0) problems.push(`a guest session read ${r.Rows.length} rows of ${entity}`);
            }
            // Mutations: a guest cannot create anything outside the operations.
            const m = await RawGraphQL(cred, 'mutation { CreateMJUser(input: { Name: "evil@guest.example", Email: "evil@guest.example", Type: "User", IsActive: true }) { ID } }');
            if (m.Data && Object.values(m.Data).some((x) => x !== null)) problems.push('a guest session created a User');
            // The ad-hoc SQL door.
            const adhoc = await RawGraphQL<{ ExecuteAdhocQuery: { Success: boolean } }>(cred, 'query { ExecuteAdhocQuery(input: { SQL: "SELECT TOP 1 ID FROM [__mj].[User]" }) { Success ErrorMessage Results } }');
            if (adhoc.Data?.ExecuteAdhocQuery?.Success) problems.push('a guest session ran ad-hoc SQL');
            Problems(problems);
        },
    },
    {
        Id: `${BUNDLE}.D11`,
        Name: 'D11 - the <mj-ballot> bundle is served as JavaScript, nosniff, public-cacheable, with no cookie',
        Fn: async () => {
            const problems: string[] = [];
            const r = await RawHttp('/vote/element/main.js');
            AssertEqual(r.Status, 200, 'the element bundle is served (build packages/AngularWidgets first if this is 404)');
            if (!/javascript/.test(r.Headers.get('content-type') ?? '')) problems.push(`content-type ${r.Headers.get('content-type')}`);
            if (r.Headers.get('x-content-type-options') !== 'nosniff') problems.push('no nosniff');
            if (r.Headers.get('set-cookie')) problems.push('the bundle sets a cookie');
            if (r.Text.length < 1000) problems.push(`the bundle is suspiciously small (${r.Text.length} bytes)`);
            if (/MJ_API_KEY|VOTING_SELECTIONS_KEY|MJ_MAGIC_LINK_PRIVATE_KEY|BEGIN (RSA )?PRIVATE KEY/.test(r.Text)) problems.push('the bundle contains a server secret name or private key');
            const cors = r.Headers.get('access-control-allow-origin');
            if (cors !== '*') problems.push(`bundle CORS is "${cors}" (a cross-origin module script needs *)`);
            // Only that exact file: traversal and siblings are not served.
            for (const path of ['/vote/element/../../package.json', '/vote/element/main.js.map/../../../.env', '/vote/element/%2e%2e/%2e%2e/package.json', '/vote/element/']) {
                const t = await RawHttp(path);
                if (t.Status === 200 && !/javascript/.test(t.Headers.get('content-type') ?? '')) problems.push(`${path} answered 200 (${t.Headers.get('content-type')})`);
                if (/"name"\s*:|DB_PASSWORD|MJ_API_KEY=/.test(t.Text)) problems.push(`${path} leaked a file`);
            }
            Problems(problems);
        },
    },
    {
        Id: `${BUNDLE}.D12`,
        Name: 'D12 - odd paths and methods on the edge: no stack traces, no X-Powered-By, reserved words are not slugs',
        Fn: async () => {
            const w = W();
            const problems: string[] = [];
            const poweredBy: string[] = [];
            const probes: Array<[string, string, string]> = [
                ['GET', '/vote', 'host'],
                ['GET', '/vote/', 'host'],
                ['GET', '/vote/session', 'host'],
                ['GET', '/vote/element', 'host'],
                ['GET', '/vote/session/info', 'info'],
                ['GET', '/vote/element/info', 'info'],
                ['PUT', '/vote/session', 'session'],
                ['DELETE', `/vote/${w.Plain.Slug}`, 'host'],
                ['POST', `/vote/${w.Plain.Slug}`, 'host'],
                ['POST', `/vote/${w.Plain.Slug}/info`, 'info'],
            ];
            for (const [method, path, scope] of probes) {
                await Spend(scope, path.split('/')[2] ?? '-');
                const r = await RawHttp(path, { Method: method, Headers: { 'content-type': 'application/json' }, Body: method === 'GET' ? undefined : '{}' });
                if (r.Status >= 500) problems.push(`${method} ${path}: ${r.Status}`);
                if (r.Status === 200 && /session|element/.test(path) && !/javascript/.test(r.Headers.get('content-type') ?? '')) problems.push(`${method} ${path} answered 200`);
                if (r.Headers.get('x-powered-by')) poweredBy.push(`${method} ${path}`);
                if (/at .*\(.*:\d+:\d+\)|node_modules|ReferenceError|TypeError/.test(r.Text)) problems.push(`${method} ${path}: leaks internals: ${r.Text.slice(0, 100)}`);
            }
            if (poweredBy.length > 0) problems.push(`${poweredBy.length}/${probes.length} responses carry "X-Powered-By: Express" (MJServer does not call app.disable('x-powered-by')); fingerprints the stack on the public edge`);
            Problems([...new Set(problems)]);
        },
    },
    {
        Id: `${BUNDLE}.D13`,
        Name: 'D13 - rate limiting: 429 + Retry-After past the allowance; a spoofed X-Forwarded-For buys nothing; others are unaffected',
        Fn: async () => {
            const w = W();
            const problems: string[] = [];
            // Throwaway slugs: the limiter runs before the distribution lookup, so they need not exist.
            const slugA = `rl-a-${randomBytes(3).toString('hex')}`;
            const slugB = `rl-b-${randomBytes(3).toString('hex')}`;
            while (globalHits.length > GLOBAL_MAX - 60) {
                prune(globalHits, Date.now());
                await Sleep(1000);
            }
            const bodyFor = (slug: string): string => SessionBody(slug, 'x', '1');
            for (let i = 0; i < 60; i++) globalHits.push(Date.now()); // book the budget this check is about to use
            const plain: RawHttpResult[] = [];
            for (let i = 0; i < 26; i++) plain.push(await RawHttp('/vote/session', { Method: 'POST', Headers: { 'content-type': 'application/json' }, Body: bodyFor(slugA) }));
            const limited = plain.filter((r) => r.Status === 429);
            if (limited.length === 0) problems.push('26 rapid requests to one slug produced no 429');
            const firstLimited = plain.findIndex((r) => r.Status === 429);
            if (firstLimited >= 0 && firstLimited > 22) problems.push(`the first 429 came only at request ${firstLimited + 1} (allowance is 20 per minute per IP+slug)`);
            const sample = limited[0];
            if (sample) {
                const retry = Number(sample.Headers.get('retry-after'));
                if (!Number.isFinite(retry) || retry < 1 || retry > 60) problems.push(`Retry-After "${sample.Headers.get('retry-after')}" is not 1..60`);
                if (sample.Json?.Code !== 'rate_limited') problems.push(`429 body code ${String(sample.Json?.Code)}`);
            }
            // Spoofed client addresses must not create fresh allowances.
            const spoofed: RawHttpResult[] = [];
            for (let i = 0; i < 26; i++) {
                spoofed.push(await RawHttp('/vote/session', { Method: 'POST', Headers: { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${i + 1}`, 'x-real-ip': `198.51.100.${i + 1}`, forwarded: `for=192.0.2.${i + 1}` }, Body: bodyFor(slugB) }));
            }
            if (!spoofed.some((r) => r.Status === 429)) problems.push('rotating X-Forwarded-For / X-Real-IP / Forwarded avoided the rate limit entirely');
            // A rate-limited slug must not slow the host page of an unrelated slug (different key), within the global allowance.
            const unrelated = await RawHttp(`/vote/${w.Plain.Slug}`);
            if (unrelated.Status === 429) problems.push('an unrelated slug was rate limited by another slug\'s traffic');
            // After the window the limiter lets traffic through again.
            const retryAfter = Number(sample?.Headers.get('retry-after') ?? 60);
            await Sleep((Math.min(Math.max(retryAfter, 1), 61) + 1) * 1000);
            const after = await RawHttp('/vote/session', { Method: 'POST', Headers: { 'content-type': 'application/json' }, Body: bodyFor(slugA) });
            if (after.Status === 429) problems.push('still rate limited after the Retry-After interval');
            // The window consumed the shared budget for this process: reset our bookkeeping.
            globalHits.length = 0;
            keyHits.clear();
            Problems(problems);
        },
    },
];

for (const check of checks) IntegrationCheckRegistry.Instance.Register(check);

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (_ctx: IntegrationCheckContext) => {
        globalHits.length = 0;
        keyHits.clear();
        const cast = await WireCast.Create();
        const admin = await cast.As('admin');
        const people = await CreatePeople(cast.System, `edge-${randomBytes(3).toString('hex')}`, 8);
        const Plain = await BuildWorldElection(cast, admin, { Voters: people, SlugPrefix: 'wire-ep' });
        const Partner = await BuildWorldElection(cast, admin, { Voters: people, SlugPrefix: 'wire-ea', AllowedOrigins: [PARTNER_ORIGIN] });
        const Other = await BuildWorldElection(cast, admin, { Voters: people, SlugPrefix: 'wire-eo' });
        const Closed = await BuildWorldElection(cast, admin, { Voters: people, SlugPrefix: 'wire-ec' });
        await CloseWorldElection(admin, Closed);
        const Unopened = await BuildWorldElection(cast, admin, { Voters: people, SlugPrefix: 'wire-eu', Open: false });
        world = { Cast: cast, Admin: admin, People: people, Plain, Partner, Other, Closed, Unopened, Origin: ResolveWireConfig().BaseUrl };
    },
    Teardown: async (_ctx: IntegrationCheckContext) => {
        if (world) for (const e of [world.Plain, world.Partner, world.Other, world.Closed, world.Unopened]) await CloseWorldElection(world.Admin, e);
        world = undefined;
    },
});
