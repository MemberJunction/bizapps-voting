# Known limitations

Only limitations verified in the code are listed.

## Dependencies and release

- **Unreleased MemberJunction changes.** This branch needs (a) CodeGen applying per-table `Entities` config at entity
  creation, including `AutoAddPermissions` (`resolveCreationTimeEntityConfig` / `resolveCreationTimeAutoAddPermissions`
  in `CodeGenLib`), and (b) the new `@memberjunction/server` exports `BuildSessionClaims`, `MagicLinkKeyManager`,
  `MagicLinkService`, `HashToken`, `GenerateRawToken`, `VerifyHostAssertion`, `IsScopeLimitedPrincipal`. Both are pending in
  an MJ PR. Without (a) the ballot tables get timestamp columns and default permissions, breaking the secrecy model; without
  (b) the public edge cannot mint sessions.
- **PostgreSQL** is produced at release time by the build engineer's converter (`mj migrate convert`); this repo ships
  T-SQL only and nothing here has been run on PostgreSQL.

## Assurance and cryptography

- **Tier C (Verifiable) is not implemented.** It needs an ElectionGuard-style `BaseVerifiableTallyProvider` registered
  under the ClassFactory key `ElectionGuard`; none ships. Without one, `OpenElection` refuses, and cast and tally return
  `TierNotSupported`. There is no fallback to tier B.
- **Trustee shares are in process memory (single instance).** Every trustee must reach the same MJAPI instance and a restart
  loses submitted shares. The server also generates the election private key in memory when `CreateTrusteeKeys` runs
  (it is split and discarded immediately); this is not a distributed key generation. Keys can be created once per election.
- **Selections key has no rotation or versioning** (see the runbook).
- **Running results are tier A only.** Tier B/C elections show results only after the tally.
- **Secret-mode receipts** are returned only by `CastBallot`; the server cannot show a Secret voter their receipt again.

## Public edge and widget

- **The edge rate limit is in memory, per instance.** The durable guard is the per-credential lockout (PIN credentials only;
  emailed-link tokens are high-entropy and single use).
- **SSO is not accepted at the public edge**, and `mj-session` is refused there (those voters use Explorer's My Ballot).
  The `sso` method driver exists but trusts an already-validated identity that the edge cannot supply.
- **The `email` attribute of `<mj-ballot>` has no effect.**
- **Emailed links are single use** and the session lasts 30 minutes by default, so an expired session needs a new link.
- **The element sends a second factor only as a stand-alone sign-in** (roster key + PIN), although the server also supports
  layering it on another method.
- **`graphql-url` defaults to `<api-root>/graphql`** and the first-party host page does not override it; the default is only
  right if MJAPI serves GraphQL under the edge root.
- **Ballot and reminder emails use fixed English text**; no template or language customization.

## Elections and results

- **Administrator tie-breaks are drawn by lot.** A contest with `TieBreakMethod = Administrator` records the lot result with a
  note that it is *provisional*; no operation lets an administrator decide the tie.
- **`HostMembers` is approximated** as any signed-in, non-guest MJ user: Voting has no host-membership concept.
- **`PollBookVisible` is a contract helper only**; no operation exposes the poll book, so the rule is not enforced anywhere.
- **Proxies**: `SubmitProxy` records a `Pending` designation. There is no accept/revoke workflow; a proxy ballot is entered
  by an administrator through `EnterPaperBallot` (channel `Proxy`), which does not link the ballot to the designation.
- **Control numbers and second-factor PINs have no operation or UI.** `CredentialEngine.IssueControlNumbers` and
  `IssueSecondFactorPins` exist but nothing calls them, so `EnterPaperBallot` and the stand-alone PIN sign-in cannot be
  used end to end without custom code. `Voting.IssueCredentials` effectively issues emailed links only.
- **No operation or dashboard moves an election to `Nominations`**, which `SubmitNomination` requires.
- **Standards-ballot comments** are stored only for Open elections. The widget renders comment boxes; there is no dashboard
  for `Voting.ResolveComment`.

## Extensibility and UI

- **The seeded Standards Ballot election type names `StandardsBallotServerDriver` / `StandardsBallotUIDriver`, which are not
  implemented.** Writes to elections of that type are refused until a driver is registered.
- **Tally methods are not runtime-pluggable**: the registry is a fixed record in `@mj-biz-apps/voting-entities`.
- **A contributed wizard step can gate progress but cannot add data** to the `CreateElection` input.
- **No Explorer UI** for trustee ceremonies, nominations, comment resolution, paper-ballot entry or proxies; those are Remote
  Operations only. The Election Types page is read-only.
- **Actions**: six exist (Create Motion Vote, Open, Close, Get Turnout, Get Election Results, Tally); none for certification,
  credentials or reminders.

## Testing

- The integration tier (27 tests) is pinned to a database named `MJ_Voting_Dev` and **skips with a warning** when the
  database or credentials are missing, so a green run without database access proves nothing.
