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
- **Ballot and reminder emails use fixed English text**; no template or language customization.

## Elections and results

- **Re-tallying stops at the first certification signature.** A `Tallied` election can be re-tallied (the recount path)
  until a certifier signs; after that, and once it is `Certified`, the tally is refused. There is no "revoke the
  certification and recount" operation.
- **Administrator tie-breaks are drawn by lot.** A contest with `TieBreakMethod = Administrator` records the lot result with a
  note that it is *provisional*; no operation lets an administrator decide the tie.
- **`HostMembers` is approximated** as any signed-in, non-guest MJ user: Voting has no host-membership concept.
- **`PollBookVisible` is a contract helper only**; no operation exposes the poll book, so the rule is not enforced anywhere.
- **Proxies have no revoke workflow.** An administrator accepts or rejects a Pending designation (`DecideProxy`), but a
  voter cannot withdraw one and no operation revokes an Accepted one. The proxy's ballot is still entered by an
  administrator through `EnterPaperBallot`; there is no proxy sign-in.
- **Control numbers and PINs are shown once and cannot be recovered.** Lost values mean issuing again, which revokes the
  earlier one. They are issued only while the election is Ready or Open.
- **Standards-ballot comments** are stored only for Open elections. The widget renders comment boxes; there is no dashboard
  for `Voting.ResolveComment`.

- **`ResultsMinCast` guards running results only.** Below the threshold, running results (`Live`, `AfterVoting`,
  `AdministratorsOnly` while Open) are withheld from the audience. The final result of record is published to the audience
  once tallied, whatever the ballot count, so in an election with very few ballots the result reveals how those few voted
  (with one ballot even the bare outcome does). The column description in the schema ("before any result is shown ...
  small-electorate results") is broader than the behaviour; `wire-secrecy.X11` asserts the behaviour. An election that must
  not disclose a tiny result should use administrators-only results.
- **`GetTurnout.QuorumMet` is omitted when the election requires no quorum** (the Explorer turnout tab shows "None
  required"); it is `true`/`false` only when a quorum is configured. The tally treats "no quorum configured" as met.

## Extensibility and UI

- **Tally methods are not runtime-pluggable**: the registry is a fixed record in `@mj-biz-apps/voting-entities`.
- **A contributed wizard step can gate progress but cannot add data** to the `CreateElection` input.
- **Paper-ballot entry renders the base ballot style** client-side (no admin operation returns a given voter's
  style), so election-type driver adjustments are not shown to staff; the server rebuilds the voter's real style and
  refuses a submission that does not fit it. The Election Types page is read-only.
- **Actions**: six exist (Create Motion Vote, Open, Close, Get Turnout, Get Election Results, Tally); none for certification,
  credentials or reminders.

## Permissions

- **Election configuration is readable by every signed-in user once the roll is frozen** (Elections, Contests, Contest
  Options, Standards Ballot Elections, certified Certifications): an election's existence, name, dates, contests and
  candidates are not secret from members, and the Explorer lists read them directly. Draft elections are hidden by
  row-level security; there is no per-voter filter.
- **Row-level security hides rows, not columns.** Members can read every column of a frozen election. The roll source
  settings are replaced by a marker and a digest at the freeze and `Configuration` accepts only documented or type-declared
  keys ([security.md](security.md#what-a-member-can-read-of-an-election-row)). Two consequences: after the freeze nobody,
  administrators included, can read the source settings back from the election (only the `RollFrozen` audit digest
  remains), and an election type whose driver needs extra configuration must declare the keys, which then become
  member-readable. Elections frozen before this change keep their settings until a data fix rewrites them.
- **Open-ballot comments and their resolutions are readable by members**, as the Standards ballot widget requires. A comment
  row carries its `ParticipationID`; members cannot resolve it to a voter (the poll book is closed), but administrators and
  inspectors can, which is by design for Open ballots.
- **`Developer` and `Integration` no longer administer elections.** A platform developer who needs to run elections must be
  given the `Voting Administrator` role.
- **The engine role is broad** (it covers everything the system user runs: voter operations, edge, jobs, tests). It is safe
  only because it is held solely by the system user (asserted by `04-access.test.ts`); never grant it to a person or key.
- **Audit events of guest ballot sessions name the voter by roll entry, not by user.** A guest principal is not a stored MJ
  user, so `ActorUserID` stays empty and the details carry `ActorEligibleVoterID`.
- **The Explorer screens that join to the poll book** (the comments panel's commenter names) show "Unknown voter" to
  anyone but administrators and inspectors.
- **A second CodeGen run over a database built from this migration rewrites seven base views and their create/update
  procedures** (it adds related-name columns). The shipped migration is the first pass and is consistent with the generated
  entity classes; do not run CodeGen against a live database and ship the result without regenerating the entity classes.

## Caching

- **A client reads its own writes straight after a Remote Operation** (confirmed by `wire-lifecycle.WL24`, which reads
  immediately after each lifecycle operation). MJ's `ProviderBase` keeps a short **dedup-linger** replay of identical
  `RunView`/`RunViews` requests (`ProviderBase.DedupLingerMs`), and from MJ `6.2.0-edge.5` the GraphQL provider drops it
  when any mutation completes. A Remote Operation does not name the entities it wrote, so the whole replay is dropped; that
  costs at most one extra round trip per read that follows an operation.
- **The server side is fresh.** After a freeze, open, close, cancel, nominations change or certification has committed, the
  operation awaits `RefreshCachedViews` (`packages/Server/src/shared/cache-refresh.ts`), which calls
  `LocalCacheManager.InvalidateEntityCaches` for the entities it changed. MJ's own maintenance of the server cache is
  fire-and-forget for a save outside a transaction and deferred to the outermost commit for one inside, so without this a
  read racing the operation could be served the pre-write slot. It runs after the commit, never inside the transaction.

## Testing

- The integration tier is pinned to a database named `MJ_Voting_Dev` (or the private voting database named by `VOTING_IT_DATABASE`) and **skips with a warning** when the
  database or credentials are missing, so a green run without database access proves nothing.
