---
"@mj-biz-apps/voting-engine-base": patch
"@mj-biz-apps/voting-core-entities-server": patch
"@mj-biz-apps/voting-server": patch
"@mj-biz-apps/voting-ng-widgets": patch
"@mj-biz-apps/voting-ng": patch
---

Harden `VotingEngineBase` with active `ProviderToUse` routing, automatic user-switch invalidation, `InvalidateCache()`, and `CanRead` entity permission gating; collapse unbatched `RunView` waterfalls and N+1 loops across Angular, AngularWidgets, CoreEntitiesServer, and Server into batched `rv.RunViews([...])` calls; and document the 5-Rule BizApps Performance & Caching Standard in `CLAUDE.md` and `AGENTS.md`.
