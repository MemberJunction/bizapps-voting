# BizApps Voting — development guide (template)

This repository is an **open app** built on top of the
[MemberJunction](https://github.com/MemberJunction/MJ) platform. TODO(template):
replace the placeholders in this file when you rename the app.

**MemberJunction's own `CLAUDE.md` is the authoritative guide — read it first.** The
`@`-imports below inline it into context; only the path matching this repo's topology
resolves, the others are inert. Prefer either over
[GitHub](https://github.com/MemberJunction/MJ/blob/next/CLAUDE.md) — the local copy is
version-matched to the MJ this repo actually runs against.

@../mj/CLAUDE.md
@../../../CLAUDE.md

*(`../mj/` = a sibling MJ checkout — both the MJ 6.x parent workspace `mj dev workspace`
generates and mjdev's instance layout, where this repo is a flat sibling of `mj/`.
`../../../` = legacy nested 5.x, `<instance>/mj/packages/dev-apps/<app>/`.)*

⚠️ **Both paths are literal, so the sibling case depends on the directory name: clone MJ
as `mj`.** `git clone https://github.com/MemberJunction/MJ` produces `MJ/`, which resolves
on a case-insensitive filesystem (macOS) and **silently does not** on Linux/CI — the guide
just never loads, with nothing to notice. Either clone it as `mj`
(`git clone …/MJ.git mj`) or add your own path as a third `@`-import line above.

MJ's guide is MJ-repo-centric — "the repo root" always means *MJ's* root. How **this** app
plugs into MJ's extension points is documented here, and the seam that matters most is the
one MJ's guide never mentions: how a resource component reaches Explorer's app switcher
([`docs/template-docs/explorer-visibility.md`](docs/template-docs/explorer-visibility.md)).

It is developed **linked to a MemberJunction checkout** — the two clones are joined into
one pnpm workspace by `mj dev workspace`; see
[`docs/template-docs/linking-to-mj.md`](docs/template-docs/linking-to-mj.md).

**Package manager: pnpm** (`corepack pnpm --version`, ≥ 10) — matching MJ 6.x,
which is a pnpm monorepo. `pnpm-lock.yaml` is the lockfile of record;
`package-lock.json` is gitignored so a stray `npm install` cannot leave a second
one behind. Two pnpm/npm differences that fail *silently*: selecting one package
is `pnpm --filter <pkg> run build` (npm's `--workspace` flag makes pnpm run the
script at the repo ROOT instead), and `pnpm run x -- --flag` passes `--` through
as a literal argument (drop the `--`).

## Repository structure

```
mj-app.json            - MJ Open App manifest (the source of truth for the app)
mj.config.cjs          - CodeGen config: output paths, schema scope, SQL capture
pnpm-workspace.yaml    - pnpm workspace + resolution settings (see .npmrc)
migrations/            - Skyway migrations for the app schema (starts empty)
metadata/              - mj-sync metadata (dev-time; seeds ship as migrations)
packages/
  Entities/            - @mj-biz-apps/voting-entities   (CodeGen entity subclasses)
  CoreEntitiesServer/  - @mj-biz-apps/voting-core-entities-server (server-side entity overrides)
  Actions/             - @mj-biz-apps/voting-actions    (MJ Actions)
  Server/              - @mj-biz-apps/voting-server     (server bootstrap -> MJAPI)
  Angular/             - @mj-biz-apps/voting-ng         (client bootstrap -> MJExplorer)
docs/                  - how this repo works (branching, publishing, codegen, linking)
docs/claude/           - the MemberJunction development guide (topic-split, with TOC)
```

## 📖 The MJ rulebook, distilled → [`docs/claude/`](docs/claude/README.md)

**[docs/claude/](docs/claude/README.md)** is an app-repo-focused distillation of MJ's
`CLAUDE.md`, split into topics with a TOC, each ending in links to MJ's own deep-dive
guides on GitHub. It exists for the case the `@`-imports above cannot cover — a bare clone
with no MJ checkout beside it (CI, a fresh machine, a reviewer reading on GitHub) — and
because it is scoped to what an *app* author needs rather than what an MJ-core contributor
needs.

**MJ's copy stays authoritative.** Where the two disagree, MJ wins; when a checkout is
present the `@`-import above has already put MJ's real guide in context. Read the relevant
topic before working in its area:

| Topic | Doc |
|---|---|
| Critical rules (non-negotiable) | [docs/claude/01-critical-rules.md](docs/claude/01-critical-rules.md) |
| Git & branches | [docs/claude/02-git-and-branches.md](docs/claude/02-git-and-branches.md) |
| Entities & data access | [docs/claude/03-entities-and-data.md](docs/claude/03-entities-and-data.md) |
| Performance | [docs/claude/04-performance.md](docs/claude/04-performance.md) |
| CodeGen & migrations | [docs/claude/05-codegen-and-migrations.md](docs/claude/05-codegen-and-migrations.md) |
| Angular | [docs/claude/06-angular.md](docs/claude/06-angular.md) |
| Code style | [docs/claude/07-code-style.md](docs/claude/07-code-style.md) |
| Metadata & mj-sync | [docs/claude/08-metadata-and-sync.md](docs/claude/08-metadata-and-sync.md) |
| Testing | [docs/claude/09-testing.md](docs/claude/09-testing.md) |

The authoring rules MJ and every BizApps repo share (plain migration DDL, CHECK values
written for people, a `primaryKey` on every metadata record) are in MJ's
[Schema and Code Authoring Guide](https://github.com/MemberJunction/MJ/blob/next/guides/SCHEMA_AND_CODE_AUTHORING_GUIDE.md), each with its reason.

## The rules that matter most in THIS repo

1. **No commits without explicit approval** — never run `git commit` unless
   the user asked for that commit; commit only what is staged.
2. **Never edit `src/generated/`** in any package — CodeGen overwrites it.
   After schema/metadata changes run codegen and **commit the regenerated code
   together with its migration** (`docs/template-docs/codegen-and-metadata-migrations.md`).
3. **Never edit an applied migration** — add a new `V*` file. Additive-only
   within a published major version.
4. **Branch rules** — feature branches cut from `next`, tracking
   `origin/<same-name>` only; PRs target `next`; a PR adding a migration must
   include a changeset (≥ minor). See `docs/template-docs/branching.md`.
5. **Single-copy invariant** — `@memberjunction/*` are peerDependencies; never
   hard-depend on them, and never run an install *inside* a member of a linked
   workspace (installs happen at the workspace parent). A second physical copy of
   `@memberjunction/global`/`core` splits MJ's class-factory registry and your
   entities/resolvers silently stop appearing
   (`docs/template-docs/versioning-and-peer-deps.md`).
6. **When linked to MJ**: the *registration* edits in the MJ repo
   (`mj.config.cjs` `dynamicPackages`, MJAPI/MJExplorer `package.json`, the
   Explorer bootstrap import) are local-only — never commit them to MJ. The
   *linking* files are generated at the workspace parent, outside both repos, and
   are never committed anywhere.

## Build & dev commands

```sh
# this repo (works standalone AND as a workspace member):
pnpm install                  # at the WORKSPACE PARENT when linked; here when standalone
pnpm run build:packages       # build this app's packages
pnpm run mj:migrate           # apply this app's migrations (needs a DB + .env)
pnpm run mj:codegen           # regenerate entities/resolvers/forms after a schema change

# one package only (from the workspace root):
pnpm --filter @mj-biz-apps/voting-ng run build
```

The full development workflow (where to add code, capturing codegen
migrations, releasing) is in the README's "Development workflow" table.
Metadata is the exception: a PR adds JSON only, and the `Metadata_Sync`
migration is generated once per release (below).

## Metadata ships as release migrations

`mj app install` and upgrades run migrations only. There is no metadata phase, by design. A record that exists only as JSON under `metadata/` reaches no host until a release ships it inside a migration.

- **PRs carry metadata JSON only.** Never hand-write or generate a `*__Metadata_Sync.sql` in a feature PR.
- **The build engineer** generates one differential `Metadata_Sync` migration per release, from a fresh database.
- **Rows missing after a fresh install** usually mean a release shipped without its metadata migration. Hand that to the build engineer rather than changing the installer.

The model, and the Open App steps that differ from core (`--schema`, the `${mjSchema}` substitution): [Release Metadata Migrations Guide](https://github.com/MemberJunction/MJ/blob/next/guides/RELEASE_METADATA_MIGRATIONS_GUIDE.md).
