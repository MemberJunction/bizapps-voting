# Getting started — filling in the template

This repository is a **working, minimal Open App** that doubles as a template.
Everything runs as-is (schema `__mj_BizAppsVoting`, packages `@mj-biz-apps/voting-*`), so you
can try the whole loop first and rename after — or rename first. `TODO(template)`
comments mark every fill-in point.

## 0. The fast path — `pnpm run init`

The setup script does this whole section for you: it prompts for your app's
identity (or takes flags — full option reference: [init-script.md](init-script.md)),
rewrites every template identifier across the repo, activates
`metadata/schema-info/` with a generated stable UUID, and prints the follow-up
steps (`pnpm install` to regenerate the lockfile, build, repo setup). Review
the result with `git diff` before committing. The checklist below is the
manual equivalent — and the reference for what the script touched.

## 1. The rename checklist

| What | Where | Notes |
|---|---|---|
| App id / display name / description / icon | `mj-app.json` (`name`, `displayName`, `description`, `icon`, `color`) | `name` is the permanent unique id |
| Publisher + repository URL | `mj-app.json`, every `packages/*/package.json` `repository.url`, root `package.json` | CI validates `repository.url` (npm provenance) |
| npm scope `@mj-biz-apps/voting-*` | all `packages/*/package.json` names + cross-deps, `mj-app.json` `packages` block, root `package.json` `build:packages`/`test` filters + `pnpm.overrides`, `.changeset/config.json` `fixed`, `mj.config.cjs` `entityPackageName` | `grep -r "mj-bizapps-voting" .` finds them all |
| Schema `__mj_BizAppsVoting` | `mj-app.json` `schema.name`, `mj.config.cjs` (`includeSchemas`, `NameRulesBySchema`, `SQLOutput.schemaPlaceholders`), root `package.json` `mj:migrate`/`mj:migrate:convert`, `metadata/schema-info/` (activate + fill the `.template` — see `docs/template-docs/metadata.md` § Schema registration) | Lowercase + underscores. `__`-prefixed names are reserved for first-party MJ apps |
| Entity name prefix `MJ_BizApps_Voting: ` | `mj.config.cjs` + `metadata/schema-info/` (in the filled-out `.schema-info.json`) `EntityNamePrefix` | Prevents entity-name collisions across apps |
| Bootstrap exports `LoadBizAppsVotingServer` / `LoadBizAppsVotingClient` | `mj-app.json` `startupExport`s ↔ `packages/Server/src/index.ts` / `packages/Angular/src/public-api.ts` | Must match exactly — this is how MJAPI/MJExplorer load your code |
| Package versions | nothing to do | Everything ships at `0.0.0` on purpose — your first `minor` changeset makes it `0.1.0`. Never hand-edit a version ([publishing.md](publishing.md) § Where versions start) |
| `mjVersionRange` | `mj-app.json` | Set to the MJ major you build against (the template ships `>=6.1.0-edge.3 <7.0.0` — MJ 6 is on `edge` prereleases, so the floor is the published version the packages pin); the release workflow re-derives it from your `@memberjunction/core` peer dep |

## 2. Decide which blocks you keep

Every capability block is optional (see [`mj-app.reference.jsonc`](../../mj-app.reference.jsonc),
and MJ's own [`packages/OpenApp/README.md`](https://github.com/MemberJunction/MJ/blob/next/packages/OpenApp/README.md) for what each
block means at install time). Delete what you don't need — a manifest-only app is valid:

- No database tables? Delete `schema` + `migrations` blocks, `migrations/`, and the DB steps below.
- No server code? Delete `packages.server`, `packages/Server`, `packages/CoreEntitiesServer`, `packages/Actions`.
- No UI? Delete `packages.client` + `packages/Angular`, plus the
  `metadata/applications/` record (nothing to navigate to).
- No seeded metadata? Delete the `metadata` block + `metadata/`.

## 2a. The one page the scaffold ships

`packages/Angular/src/lib/overview/overview.resource.ts` is a placeholder resource
component, wired end to end: registered under the `DriverClass` that
`metadata/applications/` points at, exported from `public-api.ts`, and anchored by
`LoadBizAppsVotingClient()`. It exists so the Explorer chain is **provable** rather than
described — that chain fails silently, so a scaffold that never exercises it teaches
nothing ([explorer-visibility.md](explorer-visibility.md)).

Replace its template with your real landing page, or delete the file + the record if
your app ships no UI. `pnpm run init` renames the class, the `DriverClass`, and the
record (and mints a fresh Application UUID) for you.

## 3. First dev loop

Development happens **against a MemberJunction checkout** — this repo and an MJ
clone are joined into one pnpm workspace by `mj dev workspace`; follow
[linking-to-mj.md](linking-to-mj.md). Once linked:

```sh
# from THIS repo's root (installs run at the workspace parent once linked)
pnpm run mj:migrate        # apply this app's migrations to the MJ dev database
pnpm run mj:codegen        # generate entities/resolvers/forms
pnpm run build:packages    # build this app's packages
# then start MJ's API + Explorer (pnpm run start:api / start:explorer in the MJ
# checkout) and your app is live
```

After codegen, commit the generated code together with its migration —
that convention is the backbone of the whole system:
[codegen-and-metadata-migrations.md](codegen-and-metadata-migrations.md).

## 4. Standalone build (no MJ checkout, no DB)

`corepack pnpm install && pnpm run build:packages` works in a bare clone — the
stub packages compile without a database. Use it as a CI smoke check (it is
exactly what `build.yml` runs, with `--frozen-lockfile`); real development needs
the linked setup above.
