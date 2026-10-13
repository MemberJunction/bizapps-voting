# Embedding the ballot

`<mj-ballot>` is an Angular custom element (`packages/AngularWidgets/src/element`) bundled with no MemberJunction core code.
The ballot edge in MJAPI serves the bundle and a first-party host page.

## Edge routes

The extension `VotingBallotEdge` is mounted at the root `/vote` (`MJ_SERVER_EXTENSIONS`, `Server/src/edge`):

| Route | Purpose |
|---|---|
| `GET /vote/element/main.js` | The element bundle (`AngularWidgets/dist-element/main.js`; served only if built). Public, cross-origin readable, cached 5 minutes |
| `GET /vote/:slug` | First-party host page with a nonce CSP. 404 unless the distribution is `Active` and its election `Open` |
| `GET /vote/:slug/info` | `{ ElectionName, AllowedMethods, Theme, DefaultLanguage }` for an Active distribution of an Open election |
| `POST /vote/session` (and `OPTIONS`) | Body `{ Slug, MethodCode, Credential }`; returns `{ Token, ExpiresAt, ElectionID }` |

`slug` is a `BallotDistribution.Slug` (not the election id). Once signed in, the widget runs `Voting.GetMyBallot`,
`Voting.CastBallot` and `Voting.GetResults` through MJ's generic `ExecuteRemoteOperation` GraphQL mutation with
`Authorization: Bearer <session token>`. The endpoint defaults to `<api-root>/graphql`, which is only right if your MJAPI
serves GraphQL under the edge root; otherwise set `graphql-url` on the element. The first-party host page
(`GET /vote/:slug`) does not set it, so check that the default resolves in your deployment.

**Gates** on `POST /session`, in order (`edge-core.ts`): 8 KB body cap; rate limit (per IP across slugs, then per IP + slug;
fixed window, in memory); allowlist validation of the body; Active distribution of an Open election (else 404); origin
check; credential verification (every failure is the same 401 "Sign-in failed"); mint. Error bodies are
`{ Success: false, Code, ErrorMessage }` with fixed messages; bodies and credentials are never logged. A browser `Origin`
must be same-origin or listed in the distribution's `AllowedOrigins` (the `*` wildcard is ignored; an empty list means
same-origin only), otherwise 403 with no CORS grant. The `OPTIONS` preflight carries no slug, so it grants any well-formed
origin; the `POST` enforces the allowlist.

Edge `Settings` (extension config; defaults in parentheses): `SessionTtlMinutes` (30, clamped 1-240; also read as
`voting.sessionTtlMinutes`), `RateLimitWindowMs` (60000), `RateLimitMax` (20 per IP + slug per window),
`RateLimitMaxGlobal` (90 per IP per window), `TrustedProxyHops` (0: client IP is the socket address; set it to the number of
reverse proxies appending to `X-Forwarded-For`), `ApplicationName` (`BizApps Voting`), `GuestRoleName` (MJ's
`magicLink.restrictedRoleName`). The session is an MJ magic-link guest JWT scoped to `VotingBallotSession` for one
election and voter, so MJ `magicLink.enabled` must be `true` (otherwise the edge answers 503).

## Using the element

```html
<script type="module" src="https://api.example.org/vote/element/main.js"></script>
<mj-ballot slug="2027-board-election" api-root="https://api.example.org/vote"></mj-ballot>

<iframe src="https://api.example.org/vote/2027-board-election" title="Ballot" width="100%" height="600"></iframe>
```

For a script embed the host page's origin must be in the distribution's `AllowedOrigins`. For the iframe, the host page's
`frame-ancestors` is the allowlist (or `'none'`, with `X-Frame-Options: DENY`, when it is empty).

### Attributes

| Attribute | Default | Effect |
|---|---|---|
| `slug` | none (required) | Distribution slug. Changing it reloads the ballot |
| `api-root` | `<page origin>/vote` | Base URL of the edge (`/info` and `/session` live under it) |
| `graphql-url` | `<api-root>/graphql` | GraphQL endpoint for the voter operations. Changing it rebuilds the element |
| `host-assertion` | none | Host-signed RS256 assertion; used for sign-in when present. Changing it rebuilds the element |
| `language` | the distribution's `DefaultLanguage`, else `en` | Ballot language sent to `GetMyBallot` / `CastBallot` |
| `email` | none | Accepted and passed through configuration, but **has no effect**: no sign-in flow reads it |

### Sign-in

Order of attempts when the element starts (`mj-ballot.component.ts`): a `#t=<token>` URL fragment (emailed link), else a
`host-assertion`, else, if the distribution allows `second-factor`, a form asking for a roster key and PIN, else the
error "No voting credentials provided." The token and assertion stay in memory; the fragment is removed from the address
bar. SSO and `mj-session` are refused by the edge (a voter with an MJ login uses Explorer's **My Ballot**).

- **Emailed link.** `IssueCredentials` stores only a SHA-256 of a 32-byte token and emails `/vote/<slug>#t=<token>`
  (needs `BaseUrl`, an Active distribution, an email on the voter's Person, and an email sender; see the README). The
  token is single use: the first successful sign-in redeems it, so after the 30-minute session expires the voter needs a
  new link.
- **Host assertion.** The host portal signs an RS256 JWT with its private key; the matching public key (PEM) is saved on
  the distribution as `HostPublicKey` (Settings dashboard). The assertion's audience must equal the distribution's
  `DistributionKey`; it is checked by `VerifyHostAssertion` from `@memberjunction/server`, and the identity (host user id
  first, then email) is matched to the roll.
- **Roster key + PIN** (`second-factor`). The PIN is stored as a salted scrypt hash on `VoterCredential`; wrong guesses
  are counted durably (`FailedAttempts`, `LockedUntil`; `MaxFailedAttempts` 5 and `LockoutMinutes` 15 from the method's
  `Configuration`). The server also supports layering it on another method (when the distribution allows `second-factor`
  next to others, both must pass) but the element sends a second factor only as a stand-alone sign-in. PIN issuing has no
  operation yet (`CredentialEngine.IssueSecondFactorPins` only).

The distribution's `AllowedCredentialMethods` (else the election configuration's list) decides which methods the edge
accepts.

### Events

Dispatched on the element (`bubbles`, `composed`). Details never carry a name, email or choice.

| Event | `detail` | When |
|---|---|---|
| `ballot-state-change` | `{ state }` | `ready`, `reviewing`, `voted` (the voter had already voted). Other internal states (`init`, `login`, `casting`, `cast`, `closed`, `error`) do not emit this event |
| `ballot-cast` | `{ electionId, receiptCode }` | The ballot was recorded |
| `ballot-error` | `{ message }` | A step failed (fixed, safe text) |
| `ballot-close` | `{}` | The voter pressed Cancel |

There is no public JavaScript API beyond the attributes (no `getState()`, `close()` or `reset()` methods).

### Iframe messages

When framed, the element posts to the embedding origin only, taken from `document.referrer` (never `*`):
`{ type: 'mj-ballot-height', height }` on resize, and `{ type: 'mj-ballot-event', name, detail }` mirroring each event
above. Listen with `window.addEventListener('message', ...)`.

## Consumer blindness

The element imports only `@mj-biz-apps/voting-entities/contracts`, Angular and browser APIs; the build step
(`scripts/build-element.mjs`, `ballot-bundle-guard.mjs`) fails if a server-only module enters the bundle.

## Troubleshooting

| Symptom | Check |
|---|---|
| Page 404s | Distribution `Active`, election `Open`, slug valid (letters, digits, `.`, `_`, `-`; `session` and `element` are reserved) |
| 403 on sign-in | The page's origin is not in `AllowedOrigins` |
| 401 "Sign-in failed" | Same message for every cause: wrong or used link, expired credential, voter not `Eligible`, method not allowed for the distribution, host-assertion audience or key mismatch, locked PIN. The edge log records the engine code (never the credential) |
| 429 | Rate limit; `Retry-After` is set |
| 503 | `magicLink.enabled` is false, the `BizApps Voting` application is missing from metadata, or the system user is unavailable |
