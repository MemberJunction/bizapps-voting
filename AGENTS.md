# AGENTS.md — BizApps Voting (`MemberJunction/bizapps-voting`)

This repository is the **BizApps Voting** MemberJunction Open App. Authoritative platform rules live in MJ's `CLAUDE.md` (imported by [`CLAUDE.md`](CLAUDE.md) and distilled in [`docs/claude/`](docs/claude/README.md)).

## Package Layout

- `packages/Entities` (`@mj-biz-apps/voting-entities`) — CodeGen entity subclasses, remote operations, pure voting contracts & tally algorithms, `ElectionSubtypeResolver`
- `packages/EngineBase` (`@mj-biz-apps/voting-engine-base`) — Browser- and server-safe `VotingEngineBase` metadata/taxonomy engine
- `packages/CoreEntitiesServer` (`@mj-biz-apps/voting-core-entities-server`) — Server-side entity overrides, write guards, and election-type server drivers
- `packages/Server` (`@mj-biz-apps/voting-server`) — Voting engines, credential methods, eligibility sources, scheduled jobs, remote operation handlers, and ballot edge extension
- `packages/Actions` (`@mj-biz-apps/voting-actions`) — MJ Actions wrapping voting operations
- `packages/AngularWidgets` (`@mj-biz-apps/voting-ng-widgets`) — Extensible UI driver registry, base tabs/steps/views, and `<mj-ballot>` web component
- `packages/Angular` (`@mj-biz-apps/voting-ng`) — Explorer resources (Elections, Results, My Ballot, Election Types, Settings, Trustee Share)

## Non-Negotiable Engineering Rules

1. **Zero `any` or lazy `unknown`**, **zero `.Get()`/`.Set()`** on typed entities, **`BaseSingleton`** for all singletons, **modern `@if`/`@for`/`@switch`** Angular control flow, and **zero cross-package re-exports**.
2. **Never edit `src/generated/`** or already-applied migrations. Never commit local host artifacts (`packages/GeneratedEntities/**`).
3. **Never touch `.github/` or `ci/`** unless explicitly tasked with CI maintenance.
4. **Add a `.changeset/*.md`** for any PR modifying published packages (minor or major if adding a migration).
5. **Preserve git history** — merge PRs with standard merge commits (`gh pr merge --merge`), never squash-merge unless explicitly requested.

## The 5-Rule BizApps Performance & Caching Standard

All code in `bizapps-voting` (Angular, AngularWidgets, CoreEntitiesServer, Server, Actions, EngineBase) MUST follow these five rules:

### Rule 1 — `BaseEngine` Taxonomy & Lookup Caching
- Cache bounded, shared, non-RLS reference/taxonomy tables in `VotingEngineBase` (`@mj-biz-apps/voting-engine-base`) with `CacheLocal: true` and lazy O(1) lookup maps (`Map<string, Entity>` keyed by normalized ID/Code).
- In `bizapps-voting`, the four bounded taxonomy tables are:
  - `MJ_BizApps_Voting: Election Types`
  - `MJ_BizApps_Voting: Tally Methods`
  - `MJ_BizApps_Voting: Eligibility Source Types`
  - `MJ_BizApps_Voting: Voter Credential Methods`
- Never re-query these tables via `RunView` in components, tabs, drivers, or engines — call `await VotingEngineBase.Instance.Config(false, user, provider)` and use O(1) getters (`GetElectionTypeByID`, `GetTallyMethodByID`, `GetVoterCredentialMethodByCode`, etc.).

### Rule 2 — Multi-Provider, Impersonation & RLS `CacheLocal` Safety
- Always override `ProviderToUse` on `BaseEngine` subclasses (`return this._activeProvider ?? Metadata.Provider;`) and capture `this._activeProvider = provider ?? null` in `Config()` so multi-provider server contexts and browser persona impersonation never stay latched to the first provider.
- **Only** set `CacheLocal: true` on shared, non-RLS reference/taxonomy tables. Any RLS-scoped entity MUST use `CacheLocal: false` to prevent cross-user/impersonation IndexedDB cache bleed.
- Gate every engine entity load with `CanRead` (`md.EntityByName(name)?.GetUserPermisions(effectiveUser)?.CanRead !== false`) so permission-restricted users (ordinary members, guests) never fail `Config()`, and clear any restricted slice so stale rows never bleed across user switches.
- Track `_loadedForUserId` for automatic user-switch invalidation (`shouldForceRefresh = Boolean(forceRefresh || this._cacheInvalidated || userChanged)`) and expose `InvalidateCache()` + `IsConfiguredForUser(userId)`.

### Rule 3 — `rv.RunViews([...])` Batching (Zero Waterfalls)
- Never issue `Promise.all([rv.RunView(...), rv.RunView(...)])` or sequential independent `await rv.RunView(...)` calls when queries do not depend on each other's outputs — combine them into a single **`rv.RunViews([...])`** GraphQL/DB batch call.
- Never issue N+1 `RunView` calls inside `for` loops (e.g., validating a list of person/voter IDs one by one) — collect IDs, chunk if large, and batch via `IN (...)` + `rv.RunViews([...])`.
- Bind `RunView` to the active provider (`RunView.FromMetadataProvider(this.ProviderToUse)` in Angular, `RunViewOf(ctx)` on the Server) — never reach for a bare global `new RunView()` when a provider is available.
- Default to `ResultType: 'simple'` + explicit `Fields: [...]` for all read-only projections; reserve `ResultType: 'entity_object'` strictly for rows you will mutate and `.Save()`.

### Rule 4 — `ConversationEngine`-Style Bounded Container Caching
- If an interactive view needs in-memory caching for a per-container bundle (e.g., an active election's read-only metadata bundle), bound the cache with an explicit entry cap (LRU/FIFO eviction) and invalidate on `BaseEntity` save/delete events or explicit mutation hooks.
- **NEVER** cache unbounded transactional tables (`Cast Ballots`, `Ballot Selections`, `Ballot Attributions`, `Participations`, `Voter Credentials`, `Election Audit Events`, `Ballot Comments`) or arbitrary filtered/paginated lists in `BaseEngine` or global singletons.

### Rule 5 — RLS-Safe Two-Step Entity Reads
- Never bypass entity Row-Level Security (RLS) by embedding raw SQL subqueries over restricted base views inside `ExtraFilter` on user-facing reads.
- When filtering child records by parent attributes across RLS boundaries, perform a two-step read:
  1. Resolve accessible parent IDs through a first-class `RunView` (subject to the caller's entity permissions & RLS).
  2. Query child records using chunked `IN (...)` filters over those resolved IDs (or `rv.RunViews([...])` across chunks).
- Always check `res.Success` on every `RunView` / `RunViews` entry and surface or handle `!res.Success` explicitly — never silently treat a failed query as an empty result set unless intentional and documented.

## Build & Test Commands

```sh
pnpm run build:packages   # build all @mj-biz-apps/voting-* packages
pnpm run test             # run unit test suites (vitest)
```
