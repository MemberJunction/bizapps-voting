# Repository setup — branches, defaults, and services

## 1. Create the repository

1. Create a new GitHub repository from this template (or clone + re-init).
2. Push the initial commit to `main`.
3. Create `next` from `main` and **make `next` the default branch**
   (GitHub → Settings → General → Default branch). All feature PRs target
   `next`; `main` is only touched by the Version Packages PR.

```sh
git checkout -b next
git push -u origin next
# then set next as default in GitHub settings
```

## 2. Why two branches?

- **`next`** — integration. Feature work merges here; CI (`build.yml`,
  `changes.yml`) gates every PR. Changesets accumulate here between releases.
- **`main`** — release. Only the Version Packages PR (opened automatically from
  `next`) merges here. A push to `main` triggers `publish.yml`, which builds,
  publishes to npm, tags, and opens + merges a back-merge PR into `next`.

Full flow: [branching.md](branching.md) and [publishing.md](publishing.md).

## 3. Branch protection

Nothing in the pipeline pushes to a branch directly, so both branches can be protected.
Run the script rather than clicking through Settings — it is idempotent, and dry-run by
default:

```bash
node ci/protect.mjs --repo <this-repo>           # print the plan, change nothing
node ci/protect.mjs --repo <this-repo> --apply   # write it
```

This used to be prose pointing at an "Open App Release CI Rollout" SOP. Rulesets live in
GitHub config and leave no record in git, so nothing in a repo says how its branches are
protected and drift is invisible — by the time the script was written, twenty bizApps repos
had five different ruleset shapes between them, six had `main` unprotected, and one had no
rulesets at all. A script can detect that and repair it; a document cannot.

It creates three rulesets:

| Ruleset | Branch | Carries |
|---|---|---|
| `protect-next` | default | one approval + the door checks |
| `protect-main` | `main` | one approval, nothing else |
| `protect-main-checks` | `main` | the `rr:`/`build` checks, deletion, non-fast-forward |

`main` is **split in two** because a ruleset bypass applies to every rule in its ruleset.
The release has to skip the review — `release.yml` merges the Version Packages PR with the
App token, so no human approval is needed — without skipping the gate. One ruleset makes
that impossible: whoever is excused from the review is excused from `build` too. So the CI
App bypasses `protect-main` and is deliberately absent from `protect-main-checks`. Every
*other* bypass actor, including any break-glass team, is carried onto both halves, which
preserves the human override for a stuck check. A human override is a person deciding to;
an App override would be anyone who can dispatch a workflow deciding to.

Releases are cut by dispatching **Cut the Release** (`release.yml`), not by clicking merge
on the Version Packages PR.

The script **refuses** if a differently-named ruleset already guards one of those branches,
because rulesets are additive — leaving an old one in place unions its rules with the new
ones instead of replacing them, and an old review rule the App cannot bypass would block
every release while looking replaced. `--adopt` renames it in place instead.

Two things it cannot do: creating a break-glass team needs org-admin rights, and the npm
setup in §4 is not a GitHub operation.

## 4. Services to connect

| Service | What to set up | Doc |
|---|---|---|
| npm | Own the org/scope; publish a `0.0.0` placeholder for each package (a package must exist before it can be configured, and CI refuses to publish until they all do); configure **Trusted Publisher** per package | [publishing.md](publishing.md) § first publish bootstrap |
| GitHub Actions | Ships enabled; workflows live in `.github/workflows/` | [publishing.md](publishing.md) |
| GitHub Releases | The publish workflow tags `vX.Y.Z`; `mj app install` resolves versions from these tags | [publishing.md](publishing.md) |

## 5. Local prerequisites

Node ≥ 18 and pnpm ≥ 10 (`corepack pnpm --version`; this repo and MJ 6.x are pnpm monorepos). A SQL Server database is only needed once you develop
schema/metadata against a MemberJunction instance — see
[linking-to-mj.md](linking-to-mj.md) for exactly when.
