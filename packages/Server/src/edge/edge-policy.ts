/**
 * Pure policy helpers for the public ballot edge: slug validity, the origin allowlist, client IP, and the host-page
 * security headers. No Express and no MemberJunction imports, so unit tests load it without booting anything.
 */

/** Path segments mounted under the edge root that must never be read as a distribution slug. */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set(['session', 'element']);

const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/** Distribution slugs are at most 100 characters (the column), URL-safe, and never a reserved route word. */
export function IsValidSlug(slug: string): boolean {
    if (!slug || slug.length > 100) return false;
    if (RESERVED_SLUGS.has(slug.toLowerCase())) return false;
    return SLUG_PATTERN.test(slug);
}

/** Normalises an origin for comparison: lower case, no trailing slash. */
export function NormalizeOrigin(origin: string): string {
    return origin.trim().replace(/\/+$/, '').toLowerCase();
}

/**
 * Parses BallotDistribution.AllowedOrigins: a JSON array of strings, or a comma/space/semicolon/newline separated list.
 * Entries that are not an http(s) origin are dropped (a malformed entry can never widen the list); the `*` wildcard is
 * deliberately not honoured, because an allowlist that allows everything is not an allowlist.
 */
export function ParseAllowedOrigins(text: string | null | undefined): string[] {
    if (!text || !text.trim()) return [];
    const trimmed = text.trim();
    let raw: string[];
    if (trimmed.startsWith('[')) {
        try {
            const parsed: unknown = JSON.parse(trimmed);
            raw = Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
        } catch {
            return [];
        }
    } else {
        raw = trimmed.split(/[\s,;]+/);
    }
    const out: string[] = [];
    for (const entry of raw) {
        const origin = toOrigin(entry);
        if (origin && !out.includes(origin)) out.push(origin);
    }
    return out;
}

/** `https://a.example.org/path` becomes `https://a.example.org`; anything that is not http(s) becomes null. */
function toOrigin(entry: string): string | null {
    const value = entry.trim();
    if (!value || value === '*') return null;
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
        return NormalizeOrigin(url.origin);
    } catch {
        return null;
    }
}

/** True when the browser Origin is the same host:port the request was addressed to (the first-party host page posting back). */
export function IsSameOrigin(origin: string, hostHeader: string | undefined): boolean {
    if (!origin || !hostHeader) return false;
    try {
        return new URL(origin).host.toLowerCase() === hostHeader.trim().toLowerCase();
    } catch {
        return false;
    }
}

/**
 * Whether a browser Origin may call the edge for this distribution: same-origin always, otherwise only an origin in the
 * distribution's AllowedOrigins. An empty allowlist therefore means same-origin only (unlike a checkout, a ballot is
 * not something to expose to arbitrary sites).
 */
export function OriginAllowed(origin: string, allowedOrigins: readonly string[], hostHeader?: string): boolean {
    if (IsSameOrigin(origin, hostHeader)) return true;
    const normalized = NormalizeOrigin(origin);
    return allowedOrigins.some((allowed) => NormalizeOrigin(allowed) === normalized);
}

/**
 * Client IP for rate limiting. `trustedProxyHops` is the number of reverse proxies that append to X-Forwarded-For;
 * 0 (the default) ignores the header, because its leftmost entries are client-supplied.
 */
export function ResolveClientIp(
    req: { headers: { [key: string]: unknown }; socket?: { remoteAddress?: string } },
    trustedProxyHops = 0
): string {
    const socket = req.socket?.remoteAddress ?? 'unknown';
    if (!Number.isInteger(trustedProxyHops) || trustedProxyHops < 1) return socket;
    const fwd = req.headers['x-forwarded-for'];
    const raw = Array.isArray(fwd) ? fwd.join(',') : typeof fwd === 'string' ? fwd : undefined;
    if (!raw) return socket;
    const hops = raw.split(',').map((h) => h.trim()).filter((h) => h.length > 0);
    const idx = hops.length - trustedProxyHops;
    return idx < 0 || idx >= hops.length ? socket : hops[idx];
}

/** The `frame-ancestors` directive: the distribution's allowed origins, or 'none' when it names none. */
export function FrameAncestorsDirective(allowedOrigins: readonly string[]): string {
    return allowedOrigins.length === 0 ? "frame-ancestors 'none'" : `frame-ancestors ${allowedOrigins.map((o) => NormalizeOrigin(o)).join(' ')}`;
}

/** Strips anything that could break out of a CSP source expression. */
function cleanNonce(nonce: string): string {
    return nonce.replace(/[^A-Za-z0-9+/=_-]/g, '');
}

/** The Content-Security-Policy value for the ballot host page. */
export function BuildHostCsp(nonce: string, allowedOrigins: readonly string[]): string {
    return [
        "default-src 'self'",
        "base-uri 'none'",
        "form-action 'none'",
        FrameAncestorsDirective(allowedOrigins),
        `script-src 'nonce-${cleanNonce(nonce)}'`,
        // The element renders into a shadow root, and Angular writes its component styles as <style> elements there.
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "connect-src 'self'",
    ].join('; ');
}

/** All security headers for the host page (and its error pages). */
export function HostSecurityHeaders(nonce: string, allowedOrigins: readonly string[]): Record<string, string> {
    const headers: Record<string, string> = {
        'Content-Security-Policy': BuildHostCsp(nonce, allowedOrigins),
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
    };
    // X-Frame-Options cannot express an allowlist, so it is sent only when framing is denied outright.
    if (allowedOrigins.length === 0) headers['X-Frame-Options'] = 'DENY';
    return headers;
}

/** The element bundle is public static code, readable by any origin (a cross-origin module script needs this). */
export function ElementAssetHeaders(): Record<string, string> {
    return {
        'Access-Control-Allow-Origin': '*',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Cache-Control': 'public, max-age=300',
        'X-Content-Type-Options': 'nosniff',
    };
}

/** CORS headers reflecting one allowed origin. */
export function CorsHeaders(origin: string): Record<string, string> {
    return {
        'Access-Control-Allow-Origin': origin,
        Vary: 'Origin',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
    };
}

/**
 * MJ's GraphQL route as a path: the server's `graphqlRootPath` (default `/`) with a leading slash and no stray whitespace.
 * This is the route the GraphQL endpoint is mounted on; it is not `{edge root}/graphql`.
 */
export function NormalizeGraphQLPath(rootPath: string | null | undefined): string {
    const trimmed = (rootPath ?? '').trim();
    if (!trimmed) return '/';
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

const HOST_PATTERN = /^[A-Za-z0-9.-]+(:\d{1,5})?$|^\[[0-9A-Fa-f:.]+\](:\d{1,5})?$/;

/**
 * The absolute GraphQL URL a cross-origin embed should use, for GET /:slug/info.
 * An operator-configured URL (`GraphQLUrl` extension setting, for deployments behind a gateway) wins; otherwise it is the
 * scheme and Host the voter reached us on, plus the server's GraphQL path. An unusable Host yields undefined (the element
 * then falls back to `{origin}/graphql`) rather than an echoed, attacker-shaped value.
 */
export function ResolveGraphQLUrl(o: { Configured?: string; RootPath?: string | null; Protocol?: string; Host?: string }): string | undefined {
    const configured = o.Configured?.trim();
    if (configured) return /^https?:\/\/[^\s]+$/i.test(configured) ? configured : undefined;
    const host = o.Host?.trim();
    if (!host || !HOST_PATTERN.test(host)) return undefined;
    const scheme = o.Protocol?.toLowerCase() === 'http' ? 'http' : 'https';
    return `${scheme}://${host}${NormalizeGraphQLPath(o.RootPath)}`;
}
