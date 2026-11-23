# Making your app appear in MJ Explorer

Your packages can load perfectly and your app still be **invisible**. Explorer
visibility is a five-link chain, and every link fails *silently* — no error, just
an app that isn't in the switcher or a tab that renders empty. This page is the
chain, in the order things go wrong.

```
1. component        @RegisterClass(BaseResourceComponent, 'MyOverviewResource')
                    in packages/Angular  ───────────────┐
2. bundle           exported from public-api.ts AND the client bootstrap
                    package imported by MJExplorer      │  (else tree-shaken away)
                                                        ▼
3. nav item         DefaultNavItems[].DriverClass == 'MyOverviewResource'
                    in your MJ: Applications record
4. app row          MJ: Applications exists, with DefaultForNewUser = 1
5. user access      an MJ: User Applications row for the signed-in user
                    (DefaultForNewUser gives this to NEW users only)
```

## 1. A resource component

A nav item renders an Angular component that extends `BaseResourceComponent` and
is registered under a **driver class name** — a string, resolved through MJ's
class factory at click time:

```ts
import { Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, ResourceData } from '@memberjunction/ng-shared';

@RegisterClass(BaseResourceComponent, 'VotingOverviewResource')
@Component({
  selector: 'voting-overview',
  template: `<div class="p-4"><h2>MJ_BizApps_Voting</h2></div>`,
})
export class VotingOverviewComponent extends BaseResourceComponent {
  async GetResourceDisplayName(data: ResourceData): Promise<string> { return 'Overview'; }
  async GetResourceIconClass(data: ResourceData): Promise<string> { return 'fa-solid fa-gauge-high'; }

  ngOnInit(): void {
    this.LoadData().then(() => this.NotifyLoadComplete());   // ALWAYS signal completion
  }
  private async LoadData(): Promise<void> { /* … */ }
}
```

`NotifyLoadComplete()` is not optional — Explorer shows a loading state until it
is called.

## 2. Make sure the bundler keeps it

`@RegisterClass` runs as an **import side effect**, so the class must actually be
in the bundle:

- export the component (or a thin subclass) from `packages/Angular/src/public-api.ts`;
- keep the `startupExport` function (`LoadBizAppsVotingClient`) — its only job is to
  give the bundler a reason not to tree-shake the module;
- MJExplorer must import your client package. When the app is **installed**
  (`mj app install`), the CLI maintains
  `packages/MJExplorer/src/app/generated/open-app-bootstrap.generated.ts` for
  you. In a **linked dev** setup you add the `import '@mj-biz-apps/voting-ng';` line
  yourself ([linking-to-mj.md](linking-to-mj.md) §2).

Any change here needs an **MJExplorer rebuild** — the imports are resolved at
build time, not runtime.

## 3. and 4. The `MJ: Applications` record

Authored in [`metadata/applications/`](../../metadata/applications/README.md)
(ships as an inert `.template` — activate it). The canonical shape, matching MJ
core's own records:

```json
[
  {
    "fields": {
      "Name": "MJ_BizApps_Voting",
      "Description": "What this app does, in one line",
      "Icon": "fa-solid fa-cube",
      "Color": "#264FAF",
      "DefaultForNewUser": true,
      "DefaultSequence": 1000,
      "DefaultNavItems": [
        {
          "Label": "Overview",
          "Icon": "fa-solid fa-gauge-high",
          "ResourceType": "Custom",
          "DriverClass": "VotingOverviewResource",
          "isDefault": true
        }
      ]
    },
    "relatedEntities": { "MJ: Application Entities": [] },
    "primaryKey": { "ID": "<a UUID you generate once and never change>" }
  }
]
```

Nav item kinds:

| What you want | `ResourceType` | `DriverClass` | `RecordID` |
|---|---|---|---|
| Your own component | `"Custom"` | **required** — matches `@RegisterClass` | optional |
| An MJ Dashboard record | `"Dashboards"` | not needed | **required** |
| A plain route | n/a | n/a | use the `Route` field instead |

**The `DefaultForNewUser` trap.** CodeGen auto-creates a machine-named "bucket"
Application per schema (`Name` = the schema name, `Description` = "Generated for
schema") so generated entities have something to hang `MJ: Application Entities`
links and role grants on. Its INSERT omits `DefaultForNewUser`, so it takes the
column default of `1` — visible to every new user. If your product app ships
`false`, a new user sees the bucket in the switcher and **not** your app. Ship
`true`. Two rows per schema-backed UI app is the normal, expected shape.

## 5. Access for users who already exist

`DefaultForNewUser` only applies when a user record is **created**. Existing dev
users need an explicit `MJ: User Applications` row — in an mjdev instance that's
`mjdev apps enable <slug> <app>`; otherwise add the row (or a
`UserApplication` row in your metadata) yourself.

## Getting it into a release

`metadata/` is **dev-time only** — an install never reads it. The Application
row reaches other databases as SQL, but you don't write that SQL: commit the
metadata JSON, and the build engineer's per-release `V<timestamp>__v<x.y.x>__Metadata_Sync.sql`
carries it ([metadata.md](metadata.md) § the workflow,
[codegen-and-metadata-migrations.md](codegen-and-metadata-migrations.md)).

> That seed must be generated from a **from-zero** database. A seed generated
> after a partial `drop-schema` cycle can silently omit the Application row while
> keeping the `MJ: Application Entities` rows that reference it — and every clean
> deploy then fails on `FK_ApplicationEntity_Application`. Model: [Release Metadata Migrations Guide](https://github.com/MemberJunction/MJ/blob/next/guides/RELEASE_METADATA_MIGRATIONS_GUIDE.md).

## Checklist when nothing shows up

1. Is the app in the switcher at all? → the `MJ: Applications` row / user access (§4, §5).
2. In the switcher but the tab is empty? → `DriverClass` ↔ `@RegisterClass` mismatch, or the component was tree-shaken (§1, §2).
3. Was MJExplorer rebuilt after the import was added? (§2)
4. Is the bucket app showing instead of yours? → `DefaultForNewUser` (§4).


## MJ's own references

- [`packages/OpenApp/README.md`](https://github.com/MemberJunction/MJ/blob/next/packages/OpenApp/README.md) — the client-side half of the Open App contract: the generated bootstrap file, resource components, and the nav-item table this page expands on
- [`guides/NAVIGATION_AND_ROUTING_GUIDE.md`](https://github.com/MemberJunction/MJ/blob/next/guides/NAVIGATION_AND_ROUTING_GUIDE.md) — how Explorer navigation, tabs and routes actually work
- [`guides/DASHBOARD_BEST_PRACTICES.md`](https://github.com/MemberJunction/MJ/blob/next/guides/DASHBOARD_BEST_PRACTICES.md) — the load-complete lifecycle and dashboard patterns, if your page is a dashboard
- [`guides/FORMS_ARCHITECTURE_GUIDE.md`](https://github.com/MemberJunction/MJ/blob/next/guides/FORMS_ARCHITECTURE_GUIDE.md) — for the generated entity forms your app also surfaces
- [`guides/UNIFIED_PERMISSIONS_GUIDE.md`](https://github.com/MemberJunction/MJ/blob/next/guides/UNIFIED_PERMISSIONS_GUIDE.md) — the permission model behind who can see an app and its entities
