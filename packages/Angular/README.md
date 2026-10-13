# @mj-biz-apps/voting-ng

The Explorer UI (layer L3) for BizApps Voting, plus the generated entity forms. `LoadBizAppsVotingClient()` is the client
`startupExport` named in `mj-app.json`; it keeps every `@RegisterClass` alive.

## Dashboards

They are the nav items of the **BizApps Voting** application (`metadata/applications`); each is a resource component
registered under the `DriverClass` shown.

| Nav item | `DriverClass` | What it does |
|---|---|---|
| Elections | `VotingElectionsResource` | List, creation wizard (Type, Details, Contests & options, Eligibility, Linked records, Review) and per-election tabs: Overview (open/close/cancel), Roll (freeze, amend, challenge), Credentials (issue emailed links, issuance log), Turnout (counts only, refreshes every 30 s while Open), Close & Tally (close, tally with optional seed), Certification |
| My Ballot | `VotingBallotResource` | The signed-in user's ballot via `GetMyBallot` / `CastBallot` / `GetResults`; lists open elections without `?electionId=` |
| Election Types | `VotingElectionTypesResource` | Read-only catalog of types (with resolved defaults), tally methods, eligibility sources, sign-in methods |
| Results & Certification | `VotingResultsResource` | Results for administrators and inspectors, certify, printable report, receipt verification |
| Settings | `VotingSettingsResource` | Ballot distributions (create, edit, retire; allowed origins, methods, host public key), embed snippets, credential issuance |

Tabs and wizard steps are assembled through `@mj-biz-apps/voting-ng-widgets` so election types and other apps can add to
them. There is no UI for trustee ceremonies, nominations, comment resolution, paper ballots or proxies (use the Remote
Operations). Dashboards call the server only through Remote Operations (`VotingApiService`) and entity forms.

Layer rules: this package may use the Router and Explorer services; nothing below it imports it. See the
[UI layering guide](https://github.com/MemberJunction/MJ/blob/next/guides/UI_LAYERING_GUIDE.md).

```bash
pnpm run build      # from this directory, or: pnpm --filter @mj-biz-apps/voting-ng run build  (from the workspace root)
pnpm test
```

See [Operations reference](../../docs/voting/operations.md) and [Architecture](../../docs/voting/architecture.md).
