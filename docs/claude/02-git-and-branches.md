# 2 · Git & branches

## Feature branches MUST track same-named remote branches

A local branch must track `origin/<same-name>` — never `origin/next` or
`origin/main`. If `my-feature` tracks `origin/next`, a plain `git push` sends
commits **directly to `next`**, bypassing review.

```sh
# ✅ CORRECT
git checkout next && git pull
git checkout -b my-feature-branch
git push -u origin my-feature-branch

# ❌ WRONG — a branch cut from next tracks origin/next by default
```

Before every push:

```sh
git branch -vv          # verify: my-feature [origin/my-feature] ✅
git branch --set-upstream-to=origin/<name> <name>   # fix if wrong
```

## Where to cut from

Feature branches are cut from **`next`** (the integration branch), never from
`main` (the release branch). Name them descriptively
(`feature/<what-it-does>`, `fix/…`, `chore/…`). Before starting new work,
check you're on an appropriately-named, empty feature branch — not a permanent
branch.

This repo's full branch + release model (`next` → `main`, changesets, the
publish workflow) is in [`../template-docs/branching.md`](../template-docs/branching.md) and
[`../template-docs/publishing.md`](../template-docs/publishing.md).


MJ's own branch + release conventions (and how a release line is cut) are in
[`CLAUDE.md`](https://github.com/MemberJunction/MJ/blob/next/CLAUDE.md) and
[`guides/RELEASE_ENGINEERING_RUNBOOK.md`](https://github.com/MemberJunction/MJ/blob/next/guides/RELEASE_ENGINEERING_RUNBOOK.md).
