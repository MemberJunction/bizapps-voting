/**
 * The transport-independent core of the public ballot edge: each handler takes a plain request description and returns a
 * plain response, with every collaborator injected. Express wiring lives in `ballot-edge-extension.ts`; this file has no
 * Express and no MJServer imports, which is what lets the gate order and the error contract be unit tested.
 *
 * Gate order, all fail-closed (the first gate that refuses ends the request):
 *   1. body size cap   (8 KB, enforced by the body parser BEFORE a handler runs; see the extension)
 *   2. rate limit      (per IP across slugs, then per IP + slug)
 *   3. request shape   (allowlist validation of the body)
 *   4. distribution    (Active distribution of an Open election, else 404)
 *   5. origin          (same-origin, or an origin in the distribution's AllowedOrigins; otherwise 403 and NO CORS grant)
 *   6. credential      (CredentialEngine.VerifyCredential; any failure is the same generic 401)
 *   7. mint            (election-scoped guest JWT)
 *
 * Error contract: bodies are `{ Success: false, Code, ErrorMessage }` with stable codes and fixed messages. No message is
 * derived from the request or from an engine failure, so a credential can never be echoed back, and request bodies are
 * never logged.
 */
import type { mjBizAppsVotingBallotDistributionEntity } from '@mj-biz-apps/voting-entities';
import type { VoterCredentialPresentation } from '../credentials/credential-types.js';
import { CorsHeaders, IsValidSlug, OriginAllowed } from './edge-policy.js';
import type { RateLimitStore } from './rate-limiter.js';
import { ValidateSessionRequest } from './request-validation.js';

/** A distribution plus the election facts the public edge needs. */
export interface DistributionRecord {
    Entity: mjBizAppsVotingBallotDistributionEntity;
    ElectionID: string;
    ElectionName: string;
    ElectionStatus: string;
    /** Normalised origins from AllowedOrigins. Empty means same-origin only. */
    AllowedOrigins: string[];
    /** Distribution methods, else the election configuration's. */
    AllowedMethods: string[];
    Theme: Record<string, unknown> | null;
    DefaultLanguage: string;
}

export type VerifyOutcome = { Ok: true; ElectionID: string; EligibleVoterID: string } | { Ok: false; Code: string };

export interface MintedBallotSession {
    Token: string;
    ExpiresAt: string;
}

export interface EdgeDeps {
    LoadDistribution(slug: string): Promise<DistributionRecord | null>;
    Verify(distribution: DistributionRecord, methodCode: string, credential: VoterCredentialPresentation): Promise<VerifyOutcome>;
    /** May throw when the deployment cannot mint; the handler reports a generic 503. */
    Mint(electionID: string, eligibleVoterID: string): MintedBallotSession;
    Limiter: RateLimitStore;
    /** Max requests per window per (IP, slug), and per IP across slugs. */
    RateMax: number;
    RateMaxGlobal: number;
    /** Operational log. Never receives request bodies or credentials. */
    Log(message: string): void;
}

export interface EdgeRequest {
    Ip: string;
    Origin?: string;
    Host?: string;
}

export interface EdgeResponse {
    Status: number;
    Headers: Record<string, string>;
    Body: unknown;
}

/** Stable machine codes with fixed public messages. */
export const EDGE_ERRORS = {
    bad_request: { Status: 400, Message: 'The request was not valid.' },
    not_found: { Status: 404, Message: 'This ballot is not available.' },
    origin_denied: { Status: 403, Message: 'This origin is not allowed to use this ballot.' },
    sign_in_failed: { Status: 401, Message: 'Sign-in failed' },
    rate_limited: { Status: 429, Message: 'Too many requests. Please wait a moment and try again.' },
    payload_too_large: { Status: 413, Message: 'The request was too large.' },
    unavailable: { Status: 503, Message: 'Voting is temporarily unavailable.' },
} as const;

export type EdgeErrorCode = keyof typeof EDGE_ERRORS;

/** Methods this edge cannot honour: SSO needs an IdP-token validator it does not have, MJ-session voters use a normal login (no guest mint). */
const UNSUPPORTED_EDGE_METHODS: ReadonlySet<string> = new Set(['sso', 'mj-session']);

export function ErrorResponse(code: EdgeErrorCode, headers: Record<string, string> = {}): EdgeResponse {
    const e = EDGE_ERRORS[code];
    return { Status: e.Status, Headers: headers, Body: { Success: false, Code: code, ErrorMessage: e.Message } };
}

/** Per-IP then per-(IP, slug) fixed-window gate. Returns the refusal, or null to continue. */
export function RateGate(deps: EdgeDeps, req: EdgeRequest, scope: string, slugKey: string): EdgeResponse | null {
    const global = deps.Limiter.Hit(`${req.Ip}|*`, deps.RateMaxGlobal);
    const perSlug = global.Allowed ? deps.Limiter.Hit(`${req.Ip}|${scope}|${slugKey}`, deps.RateMax) : global;
    if (global.Allowed && perSlug.Allowed) return null;
    return ErrorResponse('rate_limited', { 'Retry-After': String(perSlug.RetryAfterSeconds) });
}

/** The slug as a rate-limit key: bounded so a hostile body cannot grow the key space with long strings. */
function slugKeyOf(value: unknown): string {
    return typeof value === 'string' ? value.slice(0, 100).toLowerCase() : '-';
}

/** Origin gate. Returns CORS headers to attach (cross-origin allowed), `{}` (no Origin header / same-origin), or null when refused. */
export function OriginGate(req: EdgeRequest, allowedOrigins: readonly string[]): Record<string, string> | null {
    if (!req.Origin) return {}; // not a browser cross-origin call; the credential is the gate
    if (!OriginAllowed(req.Origin, allowedOrigins, req.Host)) return null;
    return CorsHeaders(req.Origin);
}

/** A distribution is public only while Active and its election is Open. */
function IsPublic(d: DistributionRecord): boolean {
    return d.Entity.Status === 'Active' && d.ElectionStatus === 'Open';
}

/** GET /:slug/info */
export async function HandleInfo(deps: EdgeDeps, req: EdgeRequest, slug: string): Promise<EdgeResponse> {
    const limited = RateGate(deps, req, 'info', slugKeyOf(slug));
    if (limited) return limited;
    if (!IsValidSlug(slug)) return ErrorResponse('not_found');
    const dist = await deps.LoadDistribution(slug);
    if (!dist || !IsPublic(dist)) return ErrorResponse('not_found');
    const cors = OriginGate(req, dist.AllowedOrigins);
    if (!cors) return ErrorResponse('origin_denied');
    return {
        Status: 200,
        Headers: { ...cors, 'Cache-Control': 'no-store' },
        Body: {
            ElectionName: dist.ElectionName,
            AllowedMethods: dist.AllowedMethods,
            Theme: dist.Theme,
            DefaultLanguage: dist.DefaultLanguage,
        },
    };
}

/** POST /session */
export async function HandleSession(deps: EdgeDeps, req: EdgeRequest, body: unknown): Promise<EdgeResponse> {
    const rawSlug = typeof body === 'object' && body !== null ? (body as { Slug?: unknown }).Slug : undefined;
    const limited = RateGate(deps, req, 'session', slugKeyOf(rawSlug));
    if (limited) return limited;

    const parsed = ValidateSessionRequest(body);
    if (parsed.Ok === false) return ErrorResponse('bad_request');
    const { Slug, MethodCode, Credential } = parsed.Value;
    if (!IsValidSlug(Slug)) return ErrorResponse('not_found');

    const dist = await deps.LoadDistribution(Slug);
    if (!dist || !IsPublic(dist)) return ErrorResponse('not_found');

    const cors = OriginGate(req, dist.AllowedOrigins);
    if (!cors) return ErrorResponse('origin_denied');

    if (UNSUPPORTED_EDGE_METHODS.has(MethodCode)) return ErrorResponse('sign_in_failed', cors);

    let outcome: VerifyOutcome;
    try {
        outcome = await deps.Verify(dist, MethodCode, Credential);
    } catch (err) {
        deps.Log(`[BallotEdge] credential verification threw: ${err instanceof Error ? err.name : 'error'}`);
        return ErrorResponse('unavailable', cors);
    }
    if (outcome.Ok === false) {
        // The engine's code is logged for operators; the voter sees only the generic failure.
        deps.Log(`[BallotEdge] sign-in refused (${outcome.Code}) for distribution ${dist.Entity.ID}`);
        return ErrorResponse('sign_in_failed', cors);
    }

    try {
        const minted = deps.Mint(outcome.ElectionID, outcome.EligibleVoterID);
        return {
            Status: 200,
            Headers: { ...cors, 'Cache-Control': 'no-store' },
            Body: { Token: minted.Token, ExpiresAt: minted.ExpiresAt, ElectionID: outcome.ElectionID },
        };
    } catch (err) {
        deps.Log(`[BallotEdge] session mint failed: ${err instanceof Error ? err.message : 'error'}`);
        return ErrorResponse('unavailable', cors);
    }
}

/**
 * OPTIONS preflight. A POST /session preflight carries no slug (the slug is in the body, which a preflight does not send),
 * so the distribution's allowlist cannot be consulted. The preflight therefore grants the method/headers to any well-formed
 * origin; it carries no data and has no effect. The real POST is what enforces the allowlist: a disallowed origin gets a 403
 * with no CORS header (so the browser discards it) before any credential is looked at.
 */
export async function HandlePreflight(deps: EdgeDeps, req: EdgeRequest, slug?: string): Promise<EdgeResponse> {
    const limited = RateGate(deps, req, 'preflight', slugKeyOf(slug));
    if (limited) return limited;
    const denied: EdgeResponse = { Status: 403, Headers: {}, Body: null };
    if (!req.Origin || !/^https?:\/\/[^\s/]+$/i.test(req.Origin)) return denied;
    if (slug !== undefined) {
        if (!IsValidSlug(slug)) return denied;
        const dist = await deps.LoadDistribution(slug);
        if (!dist || !OriginAllowed(req.Origin, dist.AllowedOrigins, req.Host)) return denied;
    }
    return { Status: 204, Headers: CorsHeaders(req.Origin), Body: null };
}
