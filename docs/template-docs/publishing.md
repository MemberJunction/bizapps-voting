# Publishing the app

An Open App is **consumed from GitHub + npm**: the manifest and migrations are
fetched from a tagged GitHub release, the packages are installed from npm.
Publishing = making those two things exist for a version. The pipeline is
already wired in `.github/workflows/publish.yml`.

## The release pipeline (two halves, deliberately)

Versioning and publishing are separate workflows, and neither pushes to a
protected branch. The version bump arrives as a **pull request into `main`** (that
PR is the release); publishing reads the versions that PR landed.

### 1. `version.yml` — on every push to `next`

Runs `changesets/action` (`branch: main`) with a version script and **no**
publish script, so it can only ever open or update the **"Version Packages" PR**:
head `changeset-release/main`, base `main`, opened with a GitHub App token
(`vars.APP_CLIENT_ID` + `secrets.APP_PRIVATE_KEY`) so its checks run. That PR is
the release. It contains, as a reviewable diff:

- every package bumped (all fixed packages move together)
- the generated `CHANGELOG.md` entries
- `mj-app.json`'s `version` **and** `mjVersionRange` (`ci/sync-mj-app-version.mjs`)
- a **refreshed lockfile**

The lockfile refresh is not incidental. `changeset version` rewrites every
`package.json` — internal dependency ranges included — and does **not** touch
the lockfile. Skip it and `--frozen-lockfile` fails on every branch afterwards,
which is exactly what happened in bizapps-accounting when a bump was run by hand.

### 2. `release-readiness.yml` — on any PR to `main` (the Version Packages PR)

The `rr:` gates, each a separate required check: no changesets still pending
(`rr: changesets`), a release carrying migrations or metadata is at least a minor
(`rr: minor bump`), metadata changes ship in a `Metadata_Sync` migration
(`rr: metadata shipped`), every migration since the last release has its
`migrations-pg/` counterpart (`rr: pg counterparts`), the last release is already
merged back (`rr: release base current`), no released migration was edited
(`rr: migration immutability`), and every package exists on npm
(`rr: packages on npm`).

### 3. `publish.yml` — on push to `main` (i.e. merging the Version Packages PR)

1. Validations: lockfile case-sensitivity, migration filenames, every package
   exists on npm, `repository.url` matches the root (npm provenance), and every
   publishable package restricts what it ships (`files` + `publishConfig.access`).
2. **Fails** if changesets are still pending on `main`.
3. Builds, then `changeset publish` → **npm**.
4. Tags `vX.Y.Z` **only if something shipped**.
5. Opens and merges a `release-back-merge/vX.Y.Z` PR into `next` with the App
   token, so `next` carries the released versions. If it cannot merge, the run
   goes red and names the PR.

`changeset publish` never reads `.changeset/*.md`. It compares each package's
version against the registry and publishes what is missing — so the versions the
release PR carried *are* the instruction, and a re-run is a safe no-op.

Nothing in this pipeline pushes to `main` or `next` directly: every change lands
through a PR. The old shape pushed a version commit straight to `main` and a
merge-back to `next`, and under a ruleset requiring pull requests it failed
**after** publishing to npm: registry moved, repository did not, no tag. The App
is a "pull requests only" bypass actor on `next`, so its back-merge PR merges
immediately while everyone else still needs the checks.

In **bizapps-voting itself** the version, publish and `rr:` jobs skip (they
check the repository name): the template never releases. Apps created from it run
them normally.

> **The template does not publish itself.** `publish.yml` is guarded on
> `github.repository`, so the sample `@mj-biz-apps/voting-*` packages can never reach
> npm from this repo. A generated app inherits a condition that is already true.
> Note this is deliberately *not* done by marking the sample packages
> `private: true` — all three publish gates skip private packages, so the CI here
> would pass vacuously and a generated app would inherit gates that had never
> actually run.

## Where versions start (and why `0.0.0`)

Every package in this template — and `mj-app.json` — ships at **`0.0.0`**, and the
template's own packages are **never published**. `0.0.0` is not a placeholder to
hand-edit: it is the number that makes the release machinery land on the right first
version by itself.

Your first real release should be **`0.1.0`**, and `changeset version` computes the next
version from the current one. From `0.0.0`, the first `minor` changeset — which a first
schema migration requires anyway (CI enforces it) — produces exactly `0.1.0`, with a real
changelog entry and no version edited by hand. Had the template shipped `0.1.0`, that same
changeset would produce `0.2.0`, and getting `0.1.0` out would mean publishing with no
changeset and then reconciling the two by hand.

It also lines up with the bootstrap below: `0.0.0` is the placeholder version you push to
npm to enable trusted publishing, so the manifest and the registry agree from the start.

So: **don't set a version manually.** Write changesets; the release flow owns the number.
(Sibling packages are pinned at each other's exact version and move together — see
[versioning-and-peer-deps.md](versioning-and-peer-deps.md).)

## One-time setup for a new app (first publish bootstrap)

**You do this once, by hand, before the automated flow can ever work — and the version
you push is `0.0.0`, the same version this repo ships.** Two facts force it:

- **npm's trusted publishing (OIDC) is configured per package, and a package must exist
  before it can be configured.** There is no way to grant a workflow permission to create
  a name that isn't there yet — the setting lives on the package page.
- **`publish.yml` refuses to run until they all exist.** Its
  `.github/scripts/validate-npm-packages.sh` step checks every one of your scoped
  packages against the registry and fails the job on the first missing name, so an
  unbootstrapped package doesn't half-publish a release, it stops it.

### 1. Own the npm scope

The scope in your package names (`@acme/crm-*`) must be an npm org or user you control.
Create the org on npmjs.com first if it doesn't exist — this is also the moment to decide
the scope, because renaming it later means republishing under new names
([init-script.md](init-script.md) `--scope`).

### 2. Publish a `0.0.0` placeholder for EVERY publishable package

One per package in `packages/*` — five of them in this template's layout
(`entities`, `actions`, `core-entities-server`, `server`, `ng`). Each needs to exist at
some version; `0.0.0` is the conventional "nothing released yet" marker, and it matches
what the repo already carries, so nothing has to be edited to make the two agree.

From each package directory, signed in with `npm login` (or a classic automation token):

```sh
cd packages/Entities
npm publish --access public       # publishes the 0.0.0 already in package.json
```

`--access public` is required for a scoped package the first time — scoped packages
default to restricted, and a restricted package fails the install for consumers. (This is
the one step that uses the `npm` CLI rather than pnpm: it is a registry operation, not a
workspace install.)

Two things that make this smoother:

- The packages build to `dist/` and declare `files: ["/dist"]`, so run `pnpm run
  build:packages` first — a placeholder with no `dist/` publishes an empty tarball, which
  works as a placeholder but confuses anyone who looks.
- If you'd rather not ship any real content yet, publishing from a scratch directory with
  a minimal `package.json` (just `name`, `version`, `license`, `publishConfig`) is
  equivalent for bootstrap purposes — the point is only that the name exists.
- **A package that should never be published needs no placeholder — mark it
  `"private": true`.** `changeset publish` skips private packages, and the CI gate skips
  them for the same reason (it logs the skip, so an accidental `private: true` on a package
  you *did* mean to publish is still visible in the run). That is the lever for things like
  an integration-test package that lives in `packages/` but has no business on the
  registry.

### 3. Add the Trusted Publisher on each package

On npmjs.com, for **each** package: **Settings → Trusted Publisher → GitHub Actions**,
then select your org, enter the repository, and name the workflow file **`publish.yml`**.
Check the option allowing npm publish, and save.

### 4. Never touch a token again

From then on `publish.yml` authenticates via **OIDC** — there is **no `NPM_TOKEN` secret**
to create, store or rotate (`publish.yml` already declares `permissions: id-token: write`).
Releases also carry npm **provenance**, which is why CI validates that every package's
`repository.url` matches the root.

### Checklist

- [ ] npm scope owned
- [ ] `0.0.0` published for all five packages (`npm view <name> version` returns `0.0.0`)
- [ ] Trusted Publisher configured per package, pointing at `publish.yml`
- [ ] `.github/scripts/validate-npm-packages.sh` passes locally
- [ ] first changeset written — the release flow takes it from `0.0.0` to `0.1.0`

## Why this template ships no changesets

`.changeset/` here contains only `config.json` and the README — deliberately, and it should
stay that way. The template's own `@mj-biz-apps/voting-*` packages are **never published**
(`publish.yml` is guarded on `github.repository` so they can't be), so a changeset would
only produce a "Version Packages" PR bumping sample packages nobody consumes, and push the
checked-in versions off the `0.0.0` start that makes a developer's first release land on
`0.1.0`.

Your first changeset is the one you write for **your** first real change:
`pnpm exec changeset`.

## GitHub release tags

`mj app install <repo>` resolves versions from **git tags** (`vX.Y.Z`) — the
publish workflow creates them. The manifest version at a tag must equal the
tag (step 4 guarantees it).

## The no-breaking-changes policy (IMPORTANT)

Within a published **major** version, schema changes must be **additive only**:
no dropping tables/columns, no narrowing types, no renames, no new required
parameters. Anything breaking forces a **major** bump. Consult MemberJunction's
[`packages/OpenApp/PUBLISH_NO_BREAK_POLICY.md`](https://github.com/MemberJunction/MJ/blob/next/packages/OpenApp/PUBLISH_NO_BREAK_POLICY.md)
before authoring any migration
that touches an existing published schema — upgraders run only your NEW
migrations, never a rebuild.

## Publish checklist

- [ ] Changesets on `next` describe everything since the last release
- [ ] Migrations + regenerated code committed together (see codegen doc)
- [ ] `next` is green (build.yml + changes.yml)
- [ ] The "Version Packages" PR (`changeset-release/main` → `main`) shows the
      expected version, the refreshed lockfile and the `mj-app.json` sync
- [ ] All `rr:` checks and `build` green on it; merge it
- [ ] `publish.yml` run green; tag exists; packages on npm
- [ ] The `release-back-merge/vX.Y.Z` PR merged into `next`
