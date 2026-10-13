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

Nothing in the pipeline pushes to a branch directly, so both branches can be
protected. Follow the "Open App Release CI Rollout" SOP. On `next`: changes arrive
by pull request with the door checks required and **no approval required**, and
the CI GitHub App is a "pull requests only" bypass actor so the back-merge can
merge itself. On `main`: the `rr:` checks and `build` required, **one approval**,
and dismiss-stale-reviews, with the Repository admin role as a "pull requests only"
bypass: the override for a failure case (no second reviewer, a stuck check).

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
