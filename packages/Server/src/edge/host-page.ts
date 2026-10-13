/**
 * The first-party ballot page: minimal HTML that loads the `<mj-ballot>` element bundle from the same origin.
 * The voter's token never appears here: the emailed link carries it in the URL fragment (`#t=...`), which a browser
 * does not send to the server, so this page is identical for every visitor to a slug.
 */
import { randomBytes } from 'node:crypto';
import { HostSecurityHeaders } from './edge-policy.js';

export interface HostPageOptions {
    Slug: string;
    /** The edge root path, e.g. `/vote`. */
    ApiRoot: string;
    Nonce: string;
    /** Where the element bundle is served; omitted when the bundle is not built (the page then says so). */
    ElementSrc?: string;
    Title?: string;
}

/** A fresh per-request CSP nonce. */
export function NewNonce(): string {
    return randomBytes(16).toString('base64url');
}

export function EscapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function EscapeAttr(value: string): string {
    return EscapeHtml(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const PAGE_CSS = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; min-height: 100%; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; -webkit-text-size-adjust: 100%; }
main { max-width: 44rem; margin: 0 auto; padding: clamp(1rem, 4vw, 2rem); }
.notice { font-size: 1.0625rem; line-height: 1.5; }
`;

export function RenderHostPage(o: HostPageOptions): string {
    const title = EscapeHtml(o.Title ?? 'Ballot');
    const nonce = EscapeAttr(o.Nonce);
    const body = o.ElementSrc
        ? `<mj-ballot slug="${EscapeAttr(o.Slug)}" api-root="${EscapeAttr(o.ApiRoot)}"></mj-ballot>`
        : '<p class="notice" role="alert">The ballot is not available right now.</p>';
    const script = o.ElementSrc ? `\n  <script type="module" src="${EscapeAttr(o.ElementSrc)}" nonce="${nonce}"></script>` : '';
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="robots" content="noindex" />
  <meta name="referrer" content="no-referrer" />
  <title>${title}</title>
  <style>${PAGE_CSS}</style>${script}
</head>
<body>
  <main>
    ${body}
  </main>
</body>
</html>`;
}

export function RenderHostErrorPage(message: string): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>Ballot unavailable</title>
  <style>${PAGE_CSS}</style>
</head>
<body>
  <main><p class="notice" role="alert">${EscapeHtml(message)}</p></main>
</body>
</html>`;
}

export interface HostPageResponse {
    Status: number;
    Headers: Record<string, string>;
    Html: string;
}

/** The success page, with its security headers (frame-ancestors from the distribution's origins). */
export function BuildHostPageResponse(o: Omit<HostPageOptions, 'Nonce'>, allowedOrigins: readonly string[]): HostPageResponse {
    const nonce = NewNonce();
    return {
        Status: 200,
        Headers: { ...HostSecurityHeaders(nonce, allowedOrigins), 'Content-Type': 'text/html; charset=utf-8' },
        Html: RenderHostPage({ ...o, Nonce: nonce }),
    };
}

/** An error page. It frames nowhere (no distribution is trusted yet) and carries the same hardening headers. */
export function BuildHostErrorResponse(status: number, message: string): HostPageResponse {
    const nonce = NewNonce();
    return {
        Status: status,
        Headers: { ...HostSecurityHeaders(nonce, []), 'Content-Type': 'text/html; charset=utf-8' },
        Html: RenderHostErrorPage(message),
    };
}
