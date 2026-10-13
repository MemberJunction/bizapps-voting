# @mj-biz-apps/voting-ng-widgets

Layer L2: the election-type UI driver and contribution base classes, and the `<mj-ballot>` custom element. No router, no
Explorer imports.

## Library exports (`src/public-api.ts`)

- `BaseElectionTypeUIDriver`: `GetAdminTabs`, `GetSetupSteps`, `GetDetailsForm`, `GetResultsViews`, `GetVocabulary`; each takes
  the defaults and returns the final list.
- `ElectionTypeUIDriverRegistry`: `ResolveDriver(className)` through the `ClassFactory`, falling back to the base driver;
  `GetDefaultDriver()`, `ClearCache()`.
- Contribution bases for other apps: `BaseElectionAdminTab`, `BaseElectionSetupStep` (outputs `Valid`, `Changed`),
  `BaseElectionResultsView`; helpers `overlayDescriptors` and `assembleElectionContributions` (contributions only add;
  clashing keys are refused and logged).
- `StandardsBallotUIDriver` (registered as `StandardsBallotUIDriver`): Item / Position / Ballot vocabulary, a Document setup step and details form, and a Comments results view for Open ballots.
- Descriptor and context types (`ElectionUIContext`, `ElectionAdminTabDescriptor`, ...).

## The `<mj-ballot>` element (`src/element`)

A separate, MemberJunction-free bundle. `pnpm run build` runs `ngc` and then `scripts/build-element.mjs`, which bundles
`dist/element/main.js` into `dist-element/main.js` and fails if a server-only module (or any `@memberjunction/*` code)
enters it (`scripts/ballot-bundle-guard.mjs`). The ballot edge in `@mj-biz-apps/voting-server` serves that file at
`/vote/element/main.js`.

| File | Role |
|---|---|
| `mj-ballot.component.ts` | The ballot UI: sign-in, ballot, review, cast, receipt, results; events; iframe messaging |
| `element-attributes.ts` | Observed attributes: `slug`, `api-root`, `graphql-url` (else `/info` `GraphQLUrl`, else `<origin>/`), `host-assertion`, `email` (no effect), `language` |
| `register-element.ts`, `element-host.ts`, `main.ts` | Custom-element registration and rebuild handling |
| `api/ballot-api.client.ts`, `ballot-flow.ts` | `/info`, `/session` and the `ExecuteRemoteOperation` GraphQL calls |

It imports only `@mj-biz-apps/voting-entities/contracts` and Angular. Events: `ballot-state-change`, `ballot-cast`,
`ballot-error`, `ballot-close`; iframe messages `mj-ballot-height` and `mj-ballot-event`.

See [Embedding](../../docs/voting/embedding.md) and [Extending](../../docs/voting/extending.md).

```bash
pnpm run build
pnpm test
```
