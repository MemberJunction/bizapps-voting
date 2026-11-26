# 4 · Performance

## `entity_object` vs `simple` (the biggest easy win)

| Use | When | Notes |
|---|---|---|
| `ResultType: 'entity_object'` | You will **mutate and save** the records | Full BaseEntity instances. The `Fields` param is **ignored** (all fields load — by design, entities must be whole) |
| `ResultType: 'simple'` + `Fields: [...]` | Read/display only | Plain objects, much faster; `Fields` narrows the query — use it to skip large text/JSON columns |

Anti-pattern: loading `entity_object` just to `.map(r => r.ID)`.

## Batch everything

- `RunViews` (plural) for multiple independent queries — a dashboard should
  load in 2–3 calls, not 30.
- Never query per-item in a loop; load the range once, bucket client-side.

## Deep pagination — keyset, not offset

Background jobs iterating a whole entity use `RunViewParams.AfterKey`
(keyset/seek — O(log N) per page at any depth), not `StartRow` (each page
re-scans everything skipped). Single-column-PK entities only; UI grids can
stay on `StartRow`.

```typescript
let last: CompositeKey | undefined;
while (true) {
  const r = await rv.RunView({ EntityName: 'X', AfterKey: last, MaxRows: 500, ResultType: 'entity_object' }, user);
  if (!r.Success || r.Results.length === 0) break;
  /* process */
  if (r.Results.length < 500) break;
  last = CompositeKey.FromID(r.Results[r.Results.length - 1].ID);
}
```

## Reactive caches — `BaseEngine` + `ObserveProperty`

Before building a "reload after mutation" loop in Angular, check whether a
`BaseEngine` subclass already caches the entity — subscribe to
`engine.ObserveProperty<E>('propName')` (auto-re-emits on save/delete/remote
invalidation) instead of polling. Small entity sets (dozens of rows) that you
own are worth a new engine: declare `Configs` entries and invalidation comes
free. Lazy-load with `await MyEngine.Instance.Config(false, user, provider)`
at every entry point. Don't bulk-cache entities with huge columns — use
targeted `RunView` filters for those.

## The 5-Rule BizApps Performance & Caching Standard

In `bizapps-voting`, follow these five rules everywhere (full details in [`AGENTS.md`](../../AGENTS.md) and [`CLAUDE.md`](../../CLAUDE.md)):

1. **`BaseEngine` taxonomy & lookup caching:** Use `VotingEngineBase` (`@mj-biz-apps/voting-engine-base`) with `CacheLocal: true` and O(1) lazy maps for the four shared non-RLS taxonomy tables (`Election Types`, `Tally Methods`, `Eligibility Source Types`, `Voter Credential Methods`). Never re-query them via `RunView`.
2. **Multi-provider, impersonation & RLS `CacheLocal` safety:** Override `ProviderToUse` (`return this._activeProvider ?? Metadata.Provider;`), invalidate automatically on `_loadedForUserId` switch, expose `InvalidateCache()`, gate entity loads with `CanRead` (clearing restricted slices), and keep `CacheLocal: false` on any RLS-scoped entity.
3. **`rv.RunViews([...])` batching:** Zero `Promise.all([rv.RunView(...), ...])`, sequential independent `await rv.RunView(...)` waterfalls, or N+1 `RunView` loops. Always batch with `rv.RunViews([...])` on the active provider (`RunView.FromMetadataProvider(provider)` / `RunViewOf(ctx)`), defaulting to `ResultType: 'simple'` + `Fields: [...]`.
4. **`ConversationEngine`-style bounded container caching:** Use a bounded per-container cache with an explicit entry cap and `BaseEntity` event invalidation when needed — NEVER bulk-cache unbounded transactional tables (`Cast Ballots`, `Ballot Selections`, `Participations`, `Voter Credentials`, `Election Audit Events`) or arbitrary filtered lists.
5. **RLS-safe two-step entity reads:** Never bypass RLS with raw SQL subqueries over restricted base views. Resolve accessible parent IDs via first-class `RunView`, query children with chunked `IN (...)` filters, and handle `!res.Success` explicitly.

## Server-side caching (know it exists)

MJAPI trusts its local cache completely (BaseEntity events invalidate it);
small unfiltered results are auto-cached. Per-query escape hatch when you need
true DB state after out-of-band SQL: `BypassCache: true`. Also: before
bulk-loading an entity a loaded engine may already hold, ask
`BaseEngineRegistry.Instance.TryGetCachedRecords<T>(name, { unfilteredOnly: true })`
— read the returned array, never mutate it. Full doctrine lives in MJ's
[`guides/CACHING_AND_PUBSUB_GUIDE.md`](https://github.com/MemberJunction/MJ/blob/next/guides/CACHING_AND_PUBSUB_GUIDE.md).


## MJ's deep-dive guides

- [`guides/CACHING_AND_PUBSUB_GUIDE.md`](https://github.com/MemberJunction/MJ/blob/next/guides/CACHING_AND_PUBSUB_GUIDE.md) — the full caching + pub/sub doctrine referenced above
- [`guides/KEYSET_PAGINATION_GUIDE.md`](https://github.com/MemberJunction/MJ/blob/next/guides/KEYSET_PAGINATION_GUIDE.md) — pagination that stays fast at depth
- [`guides/LAZY_LOADING_GUIDE.md`](https://github.com/MemberJunction/MJ/blob/next/guides/LAZY_LOADING_GUIDE.md) — deferring work until it is needed
- [`guides/RECORD_SET_PROCESSING_GUIDE.md`](https://github.com/MemberJunction/MJ/blob/next/guides/RECORD_SET_PROCESSING_GUIDE.md) — bulk processing patterns
