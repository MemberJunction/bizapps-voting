# Versioning & peer dependencies

## One version for the whole app

All `@mj-biz-apps/voting-*` packages version **together** (fixed versioning): the
`.changeset/config.json` `"fixed": [["@mj-biz-apps/voting-*"]]` entry makes
`changeset version` bump every package to the same number, and the publish
workflow copies that number into `mj-app.json` `"version"` — which must match
the GitHub release tag. One app = one version, everywhere.

Bump sizes follow the content (CI + the publish workflow enforce/verify):

| Change | Bump |
|---|---|
| New migration (additive schema/metadata) | **minor** (minimum — CI enforces) |
| Breaking change (see publishing.md no-break policy) | **major** |
| Code-only fix, no migration | patch |

Declare the bump in your PR with `pnpm exec changeset`.

## Caret or exact? The one rule

**A `peerDependency` is careted; a `dependency` on a sibling in this repo is exact;
everything else careted.** The reason is what each field *means*:

- A **peer** is a **compatibility claim** — "I work with any MJ 6.1.0-edge.3-or-later in
  the 6 line" — not an install instruction. The host (MJAPI/MJExplorer) is what actually
  installs the version, and it anchors it. An **exact peer pin is actively harmful**: it
  falsely vetoes every other in-range build in the tree and turns each patch release of
  MJ or Angular into a forced republish of your whole package family. This is MJ's own
  declared doctrine for its `ng-*` packages, and Open App packages follow it.
- A **sibling dependency** is an install instruction, and the siblings ship as one
  lock-step set (changesets `fixed`). Exact means a consumer can never end up with your
  `server` from one release and your `entities` from another — which for generated entity
  classes and resolvers is a real breakage, not a theoretical one. `changeset version`
  rewrites both sides together, so it costs nothing to maintain.
- Everything else your package genuinely owns (`zod`, `class-validator`) is ordinary
  semver: caret.

One pnpm-specific consequence of the exact sibling pin: `linkWorkspacePackages` links to a
local package **only when its version satisfies the declared range**, so exact means "link
iff identical version" — deterministic, and it is why a hand-edited sibling version
silently starts resolving from the registry instead.

## The three kinds of dependency (see the real examples in `packages/*/package.json`)

| Dependency on… | Declare as | Version spec | Why |
|---|---|---|---|
| A **sibling package of this app** (e.g. `@mj-biz-apps/voting-entities` from `Server`) | `dependencies` | **exact** (`0.0.0`) | Siblings ship in lock-step (fixed versioning); an exact pin means an install always gets the matched set. Under pnpm the pin must equal the sibling's local version or `linkWorkspacePackages` resolves it from the REGISTRY instead of linking — `changeset version` moves both together, so don't hand-edit one |
| **`@memberjunction/*`** | `peerDependencies` | caret range (`^6.1.0-edge.3`) | The HOST provides MJ exactly once. A hard dep could nest a second copy of `@memberjunction/global`/`core`, which splits MJ's class-factory registry and silently breaks registration — the single-copy invariant |
| **`@angular/*`** | `peerDependencies` | caret at the platform pin (`^21.1.3`) | Same reasoning; the host Explorer owns the Angular version. Caret at the pin, matching MJ's own `ng-*` packages — an exact peer pin would veto every other in-range build and turn each Angular patch into a republish of the whole family |
| Ordinary libraries the package truly owns (e.g. `zod`) | `dependencies` | caret | Normal semver semantics |
| Build tooling (`typescript`, `@angular/compiler-cli`) | `devDependencies` | caret/pinned | Never shipped |

Worked examples in this template:
- `packages/Entities/package.json` — peers only + `zod`
- `packages/Server/package.json` — exact-pinned sibling deps + MJ peers
- `packages/Angular/package.json` — Angular + MJ peers, all careted

## Root `overrides`

The root `package.json` pins `@memberjunction/core`/`@memberjunction/global` under
**`pnpm.overrides`** so a standalone `pnpm install` resolves ONE version tree — this is the
mechanism that enforces the single-copy invariant locally, and it is where an **exact** pin
belongs (an override *is* an install instruction, unlike a peer). The `@angular/*` set is
anchored the same way, as exact `devDependencies` at the root: peers state tolerance,
anchors decide what is installed. Bump both when you move to a new MJ release.

> pnpm reads `pnpm.overrides`; npm reads only a top-level `overrides`. Neither reads the
> other's, so there is no single block both honour — this repo declares pnpm's, and npm is
> not supported here (`.npmrc`, `pnpm-workspace.yaml`).

## `mjVersionRange`

The manifest's `mjVersionRange` declares which MJ versions the app supports.
You set it once; on every publish the workflow **re-derives** it from the
`@memberjunction/core` peer dependency in `packages/Entities/package.json`
(`>=<that version> <next-major>`), so keeping the peer dep honest keeps the
manifest honest.

## Upgrading the MJ baseline

1. Bump every `@memberjunction/*` peer dep + the root `overrides` to the new
   version.
2. Re-run the loop (migrate → codegen → build) against an MJ instance of that
   version; commit regenerated code.
3. Changeset: minor (or major if you drop support for an older MJ).


## MJ's own references

- [`guides/OPEN_APP_WORKSPACE_LINKING_SPEC.md`](https://github.com/MemberJunction/MJ/blob/next/guides/OPEN_APP_WORKSPACE_LINKING_SPEC.md) — the peer-declaration doctrine this page follows (libraries declare framework peers as ranges; consumers anchor the concrete version) and the single-copy census it exists to keep clean
- [`packages/OpenApp/PUBLISH_NO_BREAK_POLICY.md`](https://github.com/MemberJunction/MJ/blob/next/packages/OpenApp/PUBLISH_NO_BREAK_POLICY.md) — what makes a change breaking, i.e. when a bump has to be major
