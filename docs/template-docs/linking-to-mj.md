# Developing your app against a MemberJunction checkout (workspace linking)

An Open App doesn't run by itself — it runs **inside** MemberJunction: MJAPI
loads your server packages, MJExplorer bundles your Angular packages, and your
schema lives in an MJ database. For day-to-day development you therefore
*link* this repo to a local MJ checkout so both resolve **one** copy of every
`@memberjunction/*` package.

**Two things that sound like one, and are not** — MJ's own linking spec calls this its
foundational axiom:
[`guides/OPEN_APP_WORKSPACE_LINKING_SPEC.md`](https://github.com/MemberJunction/MJ/blob/next/guides/OPEN_APP_WORKSPACE_LINKING_SPEC.md):

| | What it does | How you do it |
|---|---|---|
| **Linking** | Redirects module resolution so MJ and your app resolve each other from local source instead of the registry | `mj dev workspace` (§1) |
| **Registration** | Makes a running MJAPI/MJExplorer actually **load** your packages at boot | two config edits in MJ (§2) |

Neither implies the other: a linked app whose packages aren't registered
resolves but never loads; a registered app that isn't linked loads the
**published** version. Development needs both.

## 0. Prerequisites

- A **MemberJunction checkout** on 6.x that builds and runs on your machine
  (clone <https://github.com/MemberJunction/MJ>, `pnpm install`,
  `pnpm run build`, a SQL Server database migrated by MJ's own setup, `.env`
  configured). MJAPI always needs its MJ database — that's independent of
  your app.
- Node ≥ 18 and **pnpm ≥ 10** (`corepack pnpm --version` — MJ 6.x and this
  template are pnpm monorepos; MJ 5.x was npm).

## 1. Link: one pnpm workspace at the common parent

`mj dev workspace` joins **sibling clones** — it does *not* nest your app
inside MJ. Put both checkouts side by side under a plain parent directory
(the parent must not itself be a git repo):

```
~/code/mj-work/                 <- the parent; workspace files are generated HERE
├─ mj/                          <- your MemberJunction checkout
└─ bizapps-voting/           <- this repo (rename to your app)
```

**Clone MJ as `mj`, lowercase** — `git clone https://github.com/MemberJunction/MJ.git mj`.
Two things key off that name: mjdev's instance layout uses `mj/`, and this repo's
`CLAUDE.md` inlines MJ's own guide with `@../mj/CLAUDE.md`. A checkout named `MJ/` works on
macOS (case-insensitive) and silently fails to load the guide on Linux/CI. The workspace
tooling itself does not care — this is purely about those literal paths.

Then, from either checkout (the CLI ships in this repo's dev dependencies —
run the **workspace** copy, not a globally installed `mj`):

```sh
./node_modules/.bin/mj dev workspace --dir ~/code/mj-work
```

It generates `pnpm-workspace.yaml`, `.npmrc`, `package.json`, `turbo.json` and
a `.mj-dev-workspace.json` sentinel **at the parent**, then runs one
`pnpm install` there. Members are auto-detected: an immediate subdirectory
carrying an `mj-app.json` (that's yours), a `@mj-biz-apps` package, or the MJ
monorepo root. Useful flags: `--include <dir>` / `--exclude <dir>` to adjust
the member set, `--no-install` to generate only, `--force` to overwrite
existing files (a `.bak` of each is kept).

```sh
mj dev workspace status --dir ~/code/mj-work   # read-only: files, members, lockfile, pnpm pin
mj dev workspace doctor --dir ~/code/mj-work   # the invariant checks (incl. the single-copy census)
mj dev workspace clean  --dir ~/code/mj-work   # teardown: removes every generated file
```

**Why this shape matters:** nothing inside either repo changes to make linking
work — the generated files live at the parent and are **never committed**
anywhere. Teardown leaves both repos exactly as their git history says.

Two consequences worth internalising:

- **Never run an install inside a member** once a workspace exists. A stray
  `npm install` (or `pnpm install` in a member) creates a member-local
  `node_modules` and a rewritten lockfile — a split brain where some
  resolution comes from the workspace and some doesn't. `mj dev workspace
  doctor` detects it; re-running `mj dev workspace --force --clean-members`
  clears it. Installs happen **at the parent**.
- **Linking is version-satisfaction-based.** A member links only when its
  local version satisfies the consumer's declared range, so an exact pin links
  only to an identical local version — otherwise that one dependency quietly
  resolves from the registry. Partial linking (some packages local, the rest
  published) is the normal case, not a fault.

**Doing it by hand instead?** The generated files are ordinary pnpm workspace
files; the same effect is a `pnpm-workspace.yaml` at the parent listing both
checkouts' `packages/*` globs, plus `linkWorkspacePackages: true`. Prefer the
command — it also enforces the single-copy census below.

**The single-copy invariant (the reason any of this exists):** exactly one
physical copy of `@memberjunction/global`, `@memberjunction/core`,
`@angular/*`, `rxjs` and `zone.js` may be resolved. Two copies split MJ's
class-factory registry and your entities/resolvers simply don't appear — with
no error — and two copies of Angular is the NG0203 browser failure. That is
why this template declares MJ as **peerDependencies** with caret ranges and
anchors `@angular/*` at the exact platform version in root `devDependencies`
(see [versioning-and-peer-deps.md](versioning-and-peer-deps.md)).

## 2. Register: make MJAPI and MJExplorer load your packages

Linking makes your code resolvable; these two edits make it **load**. Both are
in the **MJ** repo, and both are local dev wiring you never commit to MJ (§5).

1. **Server (MJAPI)** — MJ root `mj.config.cjs`:
   ```js
   dynamicPackages: {
     server: [
       {
         PackageName: '@mj-biz-apps/voting-server',
         StartupExport: 'LoadBizAppsVotingServer',   // must match mj-app.json exactly
         AppName: 'mj-bizapps-voting',
         Enabled: true
       }
     ]
   }
   ```
   and add the package to `packages/MJAPI/package.json` dependencies:
   `"@mj-biz-apps/voting-server": "0.0.0"` (whatever version your packages currently
   carry — the template starts at `0.0.0`).

2. **Client (MJExplorer)** — only if you ship UI packages. Add
   `"@mj-biz-apps/voting-ng": "0.0.0"` to `packages/MJExplorer/package.json`, and a
   static import to
   `packages/MJExplorer/src/app/generated/open-app-bootstrap.generated.ts`:
   ```ts
   import '@mj-biz-apps/voting-ng';
   ```
   (When an app is *installed* via `mj app install`, the CLI maintains that
   file for you; in a linked dev setup you add the line yourself.)

Re-run `pnpm install` **at the workspace parent** after either package.json
edit.

## 3. Database — when do you actually need one?

MJAPI itself always needs the MJ database. Whether **your app** adds DB steps
depends on which manifest blocks you kept:

| Your app has… | DB work needed |
|---|---|
| Only a manifest, or only code packages | **None** — skip to §4 |
| A `schema` + `migrations` block | **Yes** — create/migrate the schema *before first boot* (below) |
| A `metadata/` directory | Yes at dev time — `mj sync push` writes into the DB |

For a schema-backed app, from **this repo's** root:

```sh
pnpm run mj:migrate      # mj migrate --schema __mj_BizAppsVoting --dir ./migrations
```

That creates the schema (if missing) and applies your app's migrations to the
same database MJAPI uses (connection settings come from your `.env`). Re-run it
whenever you add a migration. After schema changes run CodeGen —
[codegen-and-metadata-migrations.md](codegen-and-metadata-migrations.md):

```sh
pnpm run mj:codegen
```

## 4. Build and run

```sh
# this repo's packages — from this repo's root
pnpm run build:packages

# MJ's own API + Explorer — from the MJ checkout
pnpm run start:api          # watch the log for your startupExport being called
pnpm run start:explorer     # if you wired a client package
```

Server code changes: rebuild your package + restart MJAPI (no HMR on the
server). Client changes: rebuild the package; Explorer's dev server
hot-reloads. To rebuild a single package from the workspace parent:
`pnpm --filter @mj-biz-apps/voting-ng run build` (pnpm's filter flag — `npm run
build --workspace <pkg>` is npm's and fails **silently** under pnpm by running
at the root instead).

## 5. Keep the wiring out of your commits

The §2 registration edits (`mj.config.cjs`, `MJAPI`/`MJExplorer`
`package.json`, the bootstrap import) are **local development wiring in the MJ
repo — never commit them to MJ.** The §1 linking files aren't a risk: they live
at the parent, outside both repos, which is the entire point of the design.

Your app repo's own changes commit normally on your feature branch.

When you're done: `mj dev workspace clean --dir <parent>`, revert the MJ
registration edits, and (optionally) drop the app schema from your dev
database.

## Verifying the link worked

1. `mj dev workspace doctor --dir <parent>` passes — one physical copy of each
   singleton package, no member-local `node_modules`.
2. MJAPI's boot log shows your package loading and `LoadBizAppsVotingServer` being
   called.
3. Once you've added your first migration + run CodeGen, your entities appear
   in MJ metadata (queryable via GraphQL, visible in Explorer).
