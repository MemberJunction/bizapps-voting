# Embedding the ballot

`<mj-ballot>` is an Angular custom element (`packages/AngularWidgets/src/element`) bundled with no MemberJunction core code.
The ballot edge in MJAPI serves the bundle and a first-party host page.

## Edge routes

The extension `VotingBallotEdge` is mounted at the root `/vote` (`MJ_SERVER_EXTENSIONS`, `Server/src/edge`):

| Route | Purpose |
|---|---|
| `GET /vote/element/main.js` | The element bundle (`AngularWidgets/dist-element/main.js`; served only if built). Public, cross-origin readable, cached 5 minutes |
| `GET /vote/:slug` | First-party host page with a nonce CSP. 404 unless the distribution is `Active` and its election `Open` |
| `GET /vote/:slug/info` | `{ ElectionName, AllowedMethods, Theme, DefaultLanguage, GraphQLUrl? }` for an Active distribution of an Open election. `GraphQLUrl` is MJ's GraphQL endpoint as an absolute URL |
| `POST /vote/session` (and `OPTIONS`) | Body `{ Slug, MethodCode, Credential }`; returns `{ Token, ExpiresAt, ElectionID }` |

`slug` is a `BallotDistribution.Slug` (not the election id). Once signed in, the widget runs `Voting.GetMyBallot`,
`Voting.CastBallot` and `Voting.GetResults` through MJ's generic `ExecuteRemoteOperation` GraphQL mutation with
`Authorization: Bearer <session token>`.

**GraphQL endpoint discovery.** The edge root is not MJ's GraphQL endpoint, so the element never derives it from `api-root`.
It uses, in order: the `graphql-url` attribute; the `GraphQLUrl` from `/info`; then `<page origin>/` (MJ's default
`graphqlRootPath`). The first-party host page renders `graphql-url` from MJAPI's configured `graphqlRootPath` (a path,
since it is served by the same server). `/info` builds `GraphQLUrl` from the scheme and Host the request arrived on plus
`graphqlRootPath`; an unusable Host yields no `GraphQLUrl`. Behind a gateway whose public address differs, set the edge
setting `GraphQLUrl` (an absolute `http(s)` URL), which overrides the derived value.

**Gates** on `POST /session`, in order (`edge-core.ts`): 8 KB body cap; rate limit (per IP across slugs, then per IP + slug;
fixed window, in memory); allowlist validation of the body; Active distribution of an Open election (else 404); origin
check; credential verification (every failure is the same 401 "Sign-in failed"); mint. Error bodies are
`{ Success: false, Code, ErrorMessage }` with fixed messages; bodies and credentials are never logged. A browser `Origin`
must be same-origin or listed in the distribution's `AllowedOrigins` (the `*` wildcard is ignored; an empty list means
same-origin only), otherwise 403 with no CORS grant. The `OPTIONS` preflight carries no slug, so it grants any well-formed
origin; the `POST` enforces the allowlist.

Edge `Settings` (extension config; defaults in parentheses): `GraphQLUrl` (derived; see above), `SessionTtlMinutes` (30, clamped 1-240; also read as
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
| `graphql-url` | the `/info` `GraphQLUrl`, else `<page origin>/` | GraphQL endpoint for the voter operations. Changing it rebuilds the element |
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
  next to others, both must pass) but the element sends a second factor only as a stand-alone sign-in. PINs are issued with
  `Voting.IssueSecondFactorPins` (Credentials tab; see the runbook), so this sign-in works end to end.

The distribution's `AllowedCredentialMethods` (else the election configuration's list) decides which methods the edge
accepts.

### Events

Dispatched on the element (`bubbles`, `composed`). Details never carry a name, email or choice.

| Event | `detail` | When |
|---|---|---|
| `ballot-state-change` | `{ state }` | `ready`, `reviewing`, `voted` (the voter had already voted), `verify` (the receipt check opened) and, when the check is left with Back, the state it returns to. Other internal states (`init`, `login`, `casting`, `cast`, `closed`, `error`) do not emit this event on their own |
| `ballot-cast` | `{ electionId, receiptCode }` | The ballot was recorded |
| `receipt-verified` | `{ outcome }` | A receipt check answered: `counted`, `not-counted` (recorded, then replaced by a later ballot) or `not-found` |
| `ballot-error` | `{ message }` | A step failed (fixed, safe text) |
| `ballot-close` | `{}` | The voter pressed Cancel |

There is no public JavaScript API beyond the attributes (no `getState()`, `close()` or `reset()` methods).

### Verifying a receipt

The element has a **Verify a Receipt** check (`Voting.VerifyReceipt`). It is offered after casting and on the "already
voted" screen, prefilled with that session's receipt, and from the sign-in screen. The operation needs a ballot session (a
guest scoped to the election, or a signed-in MJ user), so from the sign-in screen the element says so and opens the check
straight after the voter signs in, before the ballot; Back then shows the ballot. The answer is one of three fixed
sentences (recorded and counted; recorded but replaced by a later ballot; not found) in a `role="status"` live region; it
never says how anyone voted. The code is trimmed, spaces dropped and upper-cased before it is sent. Strings are
overridable like the rest (`verifyReceipt`, `verifyReceiptIntro`, `verifySignInFirst`, `receiptCodeLabel`,
`receiptCounted`, `receiptNotCounted`, `receiptNotFound`, ...).

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
