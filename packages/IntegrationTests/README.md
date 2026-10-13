# @mj-biz-apps/voting-integration-tests

Never published, not part of `mj-app.json`. Two tiers:

| Tier | Where | How it talks to the app |
|---|---|---|
| Database | `src/__tests__/*.test.ts` (vitest) | the engines, in process, against a real SQL Server |
| Wire | `src/checks/wire-*.checks.ts`, run by `test-harnesses/integration-client.mjs` | GraphQL only, as real personas, against a running voting MJAPI (`test-harnesses/README.md`) |

The wire tier never imports the voting server packages (a browser has none of them). Everything a check does is a Remote
Operation, an entity save/read made as a persona, or an HTTP call to the public `/vote` edge.

```bash
pnpm wire:host start && pnpm wire:provision          # once; restart the host after provisioning
node test-harnesses/integration-client.mjs            # every bundle
node test-harnesses/integration-client.mjs wire-tally # one bundle
node test-harnesses/integration-client.mjs wire-tally.WT10
WIRE_TRACE=1 node test-harnesses/integration-client.mjs wire-lifecycle   # print the reason text of every asserted refusal
```

## Wire bundles

| Bundle | Checks | What it proves |
|---|---|---|
| `wire-smoke` | S1-S6 | foundation: system key, persona keys, guest session, magic link |
| `wire-world` | WW1-WW9 | the **voting world** (below) loads idempotently over the wire and is referentially intact; the catalog covers every election type, tally method, secrecy mode, tier, timing, audience and quorum kind |
| `wire-lifecycle` | WL1-WL26 | full lifecycles as the admin persona: Draft, freeze, amend, distribute, open, PINs, edge sign-in (bad PIN, lockout), persona + guest casts, one-vote-per-voter, close, tally, certify (inspector), terminal states, revote, cancel, paper ballots, validation refusals, audit trail, read-your-writes, nominations, challenged voters. Every refusal asserts its **reason** |
| `wire-tally` | WT1-WT15 | elections whose outcomes were worked by hand (arithmetic in the comments): plurality (incl. ties and seeds), majority threshold/basis matrix with exact boundaries, quorum (Count/Percent, `NoQuorum`), approval, IRV (multi-round, exhaustion), Scottish STV (surplus transfer, fixed-point truncation), weighted rolls and weight-class means, results by audience and by timing for every viewer persona |
| `wire-trustee` | WX1-WX9 | tier B: the k-of-n key ceremony with the trustee personas, share refusals (wrong trustee, tampered, swapped, guest), fewer than k shares do not unlock the tally, any k do, the key is wiped by the tally, 3-of-3, results hidden until the tally |

## The voting world (`src/world`)

A committed catalog, not app metadata. Loaded by `LoadVotingWorld()` through entity saves and Remote Operations over the wire
(no SQL), keyed by natural keys, so a rerun changes nothing.

| File | Content |
|---|---|
| `data/organizations.csv` | Voting World Association and four member bodies (parent/child) |
| `data/people.csv` | 48 people `wNN@voting-world.test` with voting class (Individual 30, Student 10, Corporate 8) and weight (Corporate 3) |
| `data/elections.json` | 17 Draft elections `World: <key>`: all 8 election types x 5 tally methods x Open/Confidential/Secret x Standard/HighAssurance/Verifiable x the four results timings x the five results audiences x Count and Percent quorum; two rolls are frozen (weighted `all`, and the persona roll) |

The persona members (member1-4, trustee1-3) are Northern Chapter members and form the `personas` roll group; `outsider-known`
is deliberately on no roll.

World people have no MJ user, so they vote the way a public voter does: a second-factor PIN issued by
`Voting.IssueSecondFactorPins` presented to `POST /vote/session`. The edge rate-limits that call (20 per minute per ballot);
`PatientGuestSession` waits the window out rather than failing.

## Helpers (`src/wire`)

- `wire-kit.ts`: build an election as the admin (`CreateDraftElection`, `CreateLiveElection`, `LiveElection.GoLive/Close/...`),
  voters (`WireVoter`: a persona API-key session or a guest edge session), ballots described by option **labels**
  (`BallotPlan`), labelled results (`LabelledContest`, option ids translated back to labels), and refusal assertions
  (`AssertForbidden`, `AssertDeclined`).
- `world/voting-world.ts`: the world loader and readers.

Names are tagged with a per-process run id (`WIRE_RUN_ID`), so reruns never collide; elections a run opened are closed in
teardown. All reads in the bundles use `BypassCache: true` except `wire-lifecycle.WL24`, which is the check that a plain
read sees an operation's writes.

## Adversarial wire bundles (`wire-access`, `wire-secrecy`, `wire-edge`, `wire-volume`)

Run from the repo root after `pnpm run build` here, against a host restarted since `pnpm wire:provision`:
`node test-harnesses/integration-client.mjs wire-access` (or `wire-secrecy.X09`). `VOTING_WIRE_PORT` picks the host.

| Bundle | What it attacks |
|---|---|
| `wire-access` | A01-A09: all 29 Remote Operations x 9 identity columns (system, admin, inspector, member on/off the roll, outsider, guest of this/another election, trustee); A10 trustee share binding; A11/E08 table completeness; A12 the administrator alone can run an election; E01-E07: every voting entity x read/create/update/delete over RAW GraphQL x 7 identities (the tables in the file ARE the model, from `docs/voting/security.md`; `?` cells are not asserted); E09-E11 effective tamper / delete / definition-rewrite attempts |
| `wire-secrecy` | X01-X12: ballot-box schema, the four read doors (per-entity view, generic view, single record, ad-hoc SQL), ciphertext and random ids, attribution per secrecy mode, cross-table identifier intersection, audit payloads, receipts, per-cast observability, aggregate-only results, cast-order recovery, minimum-cast suppression, credential-secret exposure |
| `wire-edge` | D01-D13: raw HTTP against `/vote`: headers and CSP nonce, enumeration, generic sign-in failure, lockout, hostile bodies, origin policy, session binding, JWT tampering, guest entity reads, bundle serving, odd paths, rate limiting (D13 trips the limiter on purpose and waits about 2 minutes) |
| `wire-volume` | V01-V07: `WIRE_VOL_COUNT` (default 200) voters sign in and cast through the edge, `WIRE_VOL_PAR` (25) in flight, plus double-cast races (`WIRE_VOL_RACE`, 60). Commits data tagged `vol-<hex>`. Start the host with `VOTING_WIRE_RATE_MAX=100000` or the run spends its time honouring Retry-After |

Helpers: `src/wire/raw-graphql.ts` (any credential, raw GraphQL/HTTP), `src/wire/vote-world.ts` (elections with any secrecy mode, allowed origins, generated voters; guest casting; `MapLimit`).
