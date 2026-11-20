#!/usr/bin/env node
/**
 * Creates or repairs the branch protection an Open App release needs.
 *
 * This exists because rulesets live in GitHub config and leave NO record in git. Nothing in a
 * repo says how its branches are protected, so drift is invisible: at the time this was written,
 * twenty bizApps repos had five different ruleset shapes and three naming conventions between
 * them, six had `main` entirely unprotected, and one had no rulesets at all. A prose SOP cannot
 * detect that. A script can, and can fix it.
 *
 * Run it dry first — that is the default, and it prints what it would change:
 *
 *   node ci/protect.mjs --repo bizapps-tasks
 *   node ci/protect.mjs --repo bizapps-tasks --apply
 *
 * WHAT IT BUILDS, and why it is three rulesets rather than two
 *
 *   protect-next         ~DEFAULT_BRANCH   one approval + the door checks
 *   protect-main         refs/heads/main   one approval, nothing else
 *   protect-main-checks  refs/heads/main   the rr:/build checks, deletion, non-fast-forward
 *
 * `main` is split because a ruleset bypass applies to every rule in its ruleset. The release
 * has to skip the review (release.yml merges the Version Packages PR with the App token, so no
 * human approval is needed) WITHOUT skipping the gate. Putting the review and the checks in one
 * ruleset makes that impossible: any actor excused from the review is excused from `build` too.
 *
 * So the App bypasses `protect-main` and is deliberately absent from `protect-main-checks`.
 * Every OTHER bypass actor — the repository admin role, plus any break-glass team the repo has —
 * is carried onto both halves, preserving today's human override for a stuck check. A human
 * override is a person deciding to; an App override would be anyone who can dispatch a workflow
 * deciding to.
 *
 * TWO GOTCHAS THIS SCRIPT ENCODES SO NOBODY REDISCOVERS THEM
 *
 * 1. Rulesets are updated with PUT, not PATCH. `PATCH /repos/{o}/{r}/rulesets/{id}` returns a
 *    bare 404 even for a repo admin whose token can POST to /rulesets and GET the ruleset — it
 *    reads exactly like a permissions problem and is not. A PUT must also carry the WHOLE
 *    ruleset; the GET response's id/node_id/source/created_at/updated_at/_links/
 *    current_user_can_bypass fields have to be stripped before sending it back.
 *
 * 2. Rulesets are additive. Every ruleset matching a ref applies, so leaving an older
 *    differently-named ruleset (`main-protect`, `next-protect`, `protect-release-branches`)
 *    in place next to these does not replace it — it unions with it. An old review rule that
 *    the App does not bypass would block every release while looking like it had been replaced.
 *    This script therefore REFUSES when a foreign ruleset targets a ref it manages, unless
 *    --adopt is passed, which renames it in place instead of adding alongside it.
 *
 * WHAT IT CANNOT DO. Creating a break-glass team needs org-admin rights, and npm Trusted
 * Publisher setup is not a GitHub operation at all. Those stay in repo-setup.md.
 */
import { execFileSync } from 'node:child_process';

const ORG = 'MemberJunction';

/** The CI App that opens and merges the release PRs. Bypasses the review half only. */
const APP_ACTOR = { actor_id: 4705146, actor_type: 'Integration', bypass_mode: 'pull_request' };

/** GitHub Actions, as the integration that reports required checks. */
const ACTIONS_INTEGRATION_ID = 15368;

/** Door checks on `next` — cheap gates every PR must clear. */
const DOOR_CHECKS = [
  'migration naming',
  'migration changeset',
  'script references',
  'Parse migrations (T-SQL syntax check)',
];

/** Release-readiness checks on `main`. These are the gate the App must NOT be able to skip. */
const RELEASE_CHECKS = [
  'rr: changesets',
  'rr: minor bump',
  'rr: metadata shipped',
  'rr: pg counterparts',
  'rr: release base current',
  'rr: migration immutability',
  'rr: packages on npm',
  'build',
];

const PR_RULE = (count) => ({
  type: 'pull_request',
  parameters: {
    required_approving_review_count: count,
    dismiss_stale_reviews_on_push: true,
    required_reviewers: [],
    require_code_owner_review: false,
    dismissal_restriction: { enabled: false, allowed_actors: [] },
    require_last_push_approval: false,
    required_review_thread_resolution: false,
    require_extra_approval_for_unattributed_changes: true,
    allowed_merge_methods: ['merge', 'squash', 'rebase'],
  },
});

const CHECKS_RULE = (contexts, strict) => ({
  type: 'required_status_checks',
  parameters: {
    strict_required_status_checks_policy: strict,
    do_not_enforce_on_create: false,
    required_status_checks: contexts.map((context) => ({
      context,
      integration_id: ACTIONS_INTEGRATION_ID,
    })),
  },
});

function gh(args, { allowFailure = false, input } = {}) {
  try {
    return execFileSync('gh', args, {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      ...(input === undefined ? {} : { input }),
    });
  } catch (err) {
    if (allowFailure) return { error: err.stderr || err.message };
    console.error(`✗ gh ${args.join(' ')}\n${err.stderr || err.message}`);
    process.exit(1);
  }
}

const api = (path, extra = []) => {
  const out = gh(['api', path, ...extra], { allowFailure: true });
  return typeof out === 'string' ? JSON.parse(out) : null;
};

/* ---------------------------------------------------------------- arguments */

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1];
};

const repoArg = value('--repo');
if (!repoArg) {
  console.error('✗ usage: node ci/protect.mjs --repo <name|owner/name> [--apply] [--adopt]');
  process.exit(1);
}
const repo = repoArg.includes('/') ? repoArg : `${ORG}/${repoArg}`;
const apply = flag('--apply');
const adopt = flag('--adopt');

/* ------------------------------------------------------------ desired state */

/**
 * Bypass actors to carry forward. Everything the repo already trusts is preserved; the App is
 * added to the review half and stripped from the checks half, whatever the input looked like.
 */
function mergeActors(existing, { withApp, seed }) {
  // No predecessor means a fresh repo, so seed whatever that ruleset is defined to start with.
  // Otherwise preserve what the repo already trusts EXACTLY — this script's job is to move the
  // App, not to hand anyone else a bypass they did not have. Adding the admin role to
  // `protect-next` here would quietly grant admins a review bypass on the branch all the work
  // lands on, which no bizApps repo grants today.
  const source = existing === undefined ? seed : existing;
  const kept = (source ?? []).filter(
    (a) => !(a.actor_type === 'Integration' && a.actor_id === APP_ACTOR.actor_id),
  );
  const normalized = kept.map((a) => ({
    actor_id: a.actor_id,
    actor_type: a.actor_type,
    bypass_mode: a.bypass_mode,
  }));
  return withApp ? [...normalized, { ...APP_ACTOR }] : normalized;
}

const DESIRED = [
  {
    name: 'protect-next',
    refs: ['~DEFAULT_BRANCH'],
    withApp: true,
    seed: [], // no bizApps repo grants an admin review bypass on `next`
    rules: [
      { type: 'deletion' },
      { type: 'non_fast_forward' },
      PR_RULE(1),
      CHECKS_RULE(DOOR_CHECKS, true),
    ],
  },
  {
    name: 'protect-main',
    refs: ['refs/heads/main'],
    withApp: true, // the release merge skips the review, and only the review
    seed: [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'pull_request' }],
    rules: [PR_RULE(1)],
  },
  {
    name: 'protect-main-checks',
    refs: ['refs/heads/main'],
    withApp: false, // the gate nothing automated may skip
    seed: [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'pull_request' }],
    rules: [
      { type: 'deletion' },
      { type: 'non_fast_forward' },
      CHECKS_RULE(RELEASE_CHECKS, false),
    ],
  },
];

const MANAGED = new Set(DESIRED.map((d) => d.name));
const MANAGED_REFS = new Set(DESIRED.flatMap((d) => d.refs));

/* ------------------------------------------------------------------- checks */

console.log(`repo: ${repo}   mode: ${apply ? 'APPLY' : 'dry run'}\n`);

const defaultBranch = api(`repos/${repo}`)?.default_branch ?? 'next';

/**
 * `~DEFAULT_BRANCH` and `refs/heads/<default>` name the SAME branch. A repo carrying
 * `next-protect` on the literal ref would otherwise look unrelated to our `protect-next` on
 * `~DEFAULT_BRANCH`, and the two would union instead of one replacing the other.
 */
const normalizeRef = (ref) =>
  ref === '~DEFAULT_BRANCH' || ref === `refs/heads/${defaultBranch}`
    ? '~DEFAULT_BRANCH'
    : ref;

const existing = api(`repos/${repo}/rulesets`);
if (existing === null) {
  console.error(`✗ cannot read rulesets on ${repo} — is the name right, and are you an admin?`);
  process.exit(1);
}
const full = existing.map((r) => api(`repos/${repo}/rulesets/${r.id}`)).filter(Boolean);

// Gotcha 2: a foreign ruleset on a managed ref unions with ours instead of being replaced.
const foreign = full.filter(
  (r) =>
    !MANAGED.has(r.name) &&
    r.target === 'branch' &&
    (r.conditions?.ref_name?.include ?? []).some((ref) => MANAGED_REFS.has(normalizeRef(ref))),
);
if (foreign.length && !adopt) {
  console.error('✗ these rulesets already target a ref this script manages:\n');
  for (const r of foreign) {
    console.error(`    ${r.name} (${r.id}) -> ${r.conditions.ref_name.include.join(', ')}`);
  }
  console.error(
    '\n  Rulesets are additive, so adding ours alongside them would union the rules, not\n' +
      '  replace them — an old review rule the App does not bypass would block every release.\n' +
      '  Re-run with --adopt to rename them in place, or delete them first.',
  );
  process.exit(1);
}

// A required check that no workflow produces leaves every PR on "Expected — waiting for
// status" forever. The reliable signal is not whether a context reported recently (the `rr:`
// checks run on PRs into `main` and never appear on a `next` commit), but whether any workflow
// in the repo declares that name at all. That catches the real failure: a typo, or a context
// copied from a repo whose pipeline differs.
const workflows = api(`repos/${repo}/contents/.github/workflows`) ?? [];
let workflowSource = '';
for (const wf of workflows) {
  if (!/\.ya?ml$/.test(wf.name ?? '')) continue;
  const file = api(`repos/${repo}/contents/.github/workflows/${wf.name}`);
  if (file?.content) workflowSource += Buffer.from(file.content, 'base64').toString('utf8');
}
if (workflowSource) {
  const undeclared = [...DOOR_CHECKS, ...RELEASE_CHECKS].filter((c) => !workflowSource.includes(c));
  if (undeclared.length) {
    console.log('⚠ no workflow in this repo declares these required contexts:');
    for (const c of undeclared) console.log(`    ${c}`);
    console.log(
      '  A required check that never reports blocks every PR indefinitely. Fix the name, or\n' +
        '  drop it from this script for this repo, before applying.\n',
    );
  }
} else {
  console.log('⚠ could not read .github/workflows — required contexts were not validated.\n');
}

/* -------------------------------------------------------------------- apply */

/**
 * What already guards each managed ref, captured BEFORE anything is rewritten.
 *
 * `protect-main-checks` is new in every repo, so it has no predecessor of its own to inherit
 * from — and seeding it with just the admin role would silently drop the break-glass teams that
 * can override a stuck check today. Splitting a ruleset must not quietly narrow who can override
 * it, so the new half inherits from the ruleset it was split out of.
 */
const priorActorsByRef = new Map();
for (const r of full) {
  if (r.target !== 'branch') continue;
  for (const ref of r.conditions?.ref_name?.include ?? []) {
    const key = normalizeRef(ref);
    if (MANAGED_REFS.has(key) && !priorActorsByRef.has(key)) {
      priorActorsByRef.set(key, r.bypass_actors ?? []);
    }
  }
}

let changed = 0;
for (const want of DESIRED) {
  const byName = full.find((r) => r.name === want.name);
  const target =
    byName ??
    (adopt
      ? foreign.find((r) =>
          (r.conditions.ref_name.include ?? []).some((x) => want.refs.includes(normalizeRef(x))),
        )
      : undefined);

  // Prefer this ruleset's own actors; else those of whatever guards the same ref today; else seed.
  const inherited = target?.bypass_actors ?? priorActorsByRef.get(normalizeRef(want.refs[0]));

  const payload = {
    name: want.name,
    target: 'branch',
    enforcement: 'active',
    conditions: { ref_name: { include: want.refs, exclude: [] } },
    rules: want.rules,
    bypass_actors: mergeActors(inherited, { withApp: want.withApp, seed: want.seed }),
  };

  const verb = target ? 'update' : 'create';
  const actors = payload.bypass_actors
    .map((a) => `${a.actor_type}:${a.actor_id}:${a.bypass_mode}`)
    .join(', ');
  const label = target ? `${want.name} (${target.id}${byName ? '' : ` was "${target.name}"`})` : want.name;
  console.log(`${verb.padEnd(6)} ${label}`);
  console.log(`       refs:   ${want.refs.join(', ')}`);
  console.log(`       rules:  ${want.rules.map((r) => r.type).join(', ')}`);
  console.log(`       bypass: ${actors || '(none)'}`);

  if (!apply) {
    console.log('');
    continue;
  }

  // Gotcha 1: PUT to update, POST to create. PATCH 404s.
  const path = target ? `repos/${repo}/rulesets/${target.id}` : `repos/${repo}/rulesets`;
  const method = target ? 'PUT' : 'POST';
  const out = gh(['api', '--method', method, path, '--input', '-'], {
    allowFailure: true,
    input: JSON.stringify(payload),
  });
  if (typeof out !== 'string') {
    console.error(`✗ ${verb} failed for ${want.name}:\n${out.error}`);
    process.exit(1);
  }

  // Read it back rather than trusting the write: confirm the review count and the App's
  // presence or absence landed as intended.
  const after = JSON.parse(out);
  const pr = after.rules.find((r) => r.type === 'pull_request');
  const hasApp = (after.bypass_actors ?? []).some(
    (a) => a.actor_type === 'Integration' && a.actor_id === APP_ACTOR.actor_id,
  );
  if (hasApp !== want.withApp) {
    console.error(`✗ ${want.name}: App bypass is ${hasApp}, expected ${want.withApp}`);
    process.exit(1);
  }
  const wantPr = want.rules.find((r) => r.type === 'pull_request');
  if (wantPr && pr?.parameters.required_approving_review_count !== 1) {
    console.error(`✗ ${want.name}: approvals landed as ${pr?.parameters.required_approving_review_count}, expected 1`);
    process.exit(1);
  }
  changed += 1;
  console.log(`       ✔ written and verified (id ${after.id})\n`);
}

if (!apply) {
  console.log(`dry run — nothing written. Re-run with --apply to make the ${DESIRED.length} changes above.`);
} else {
  console.log(`✔ ${changed}/${DESIRED.length} rulesets written on ${repo}.`);
}
