# Voting wire tier (GraphQL integration tests)

Proves BizApps Voting end to end over GraphQL: a voting-only MJAPI host, provisioned personas that authenticate with real
user API keys, and a client-safe dispatcher. The database tier (`packages/IntegrationTests/src/__tests__`, vitest) is separate
and unchanged.

| Piece | Where |
|---|---|
| Voting-only MJAPI host (port 4104, `MJ_Voting_Dev`, or the private database named by `VOTING_IT_DATABASE`) | `packages/TestHost` (`mj.config.cjs`, `src/start-host.mjs`) |
| Start / stop / status | `node test-harnesses/host.mjs start\|stop\|restart\|status` |
| Persona provisioning (idempotent) | `packages/IntegrationTests/src/provision` |
| Wire client (one provider per identity) | `packages/IntegrationTests/src/wire` |
| Check bundles | `packages/IntegrationTests/src/checks` (`wire-smoke`) |
| Dispatcher | `test-harnesses/integration-client.mjs` |

## Run

```bash
# once, at the M5 root:  pnpm install      (never inside this repo)
pnpm wire:host start        # boots MJAPI on :4104; log + pid in ./tmp (override: VOTING_WIRE_RUN_DIR)
pnpm wire:provision         # builds IntegrationTests, creates users/roles/people/API keys, writes test-harnesses/.personas.local.json
pnpm wire:test              # builds, then runs every bundle; or: node test-harnesses/integration-client.mjs wire-smoke.S3
pnpm wire:host stop
```

Restart the host after provisioning (it caches users and API-key scopes at boot).

The `.env` of this repo must hold `DB_*`, `MJ_API_KEY`, `MJ_MAGIC_LINK_PRIVATE_KEY` (base64 RSA PEM) and
`VOTING_SELECTIONS_KEY`. They are local-only; nothing here prints a value.

## Personas

Every persona is an MJ User (`<key>@voting-wire.test`) with a user API key that carries the `full_access` API scope (the
voting operations declare `voting:*` scopes that no database defines yet, so the scope layer is bypassed on purpose and the
checks exercise roles, entity permissions and each operation's `Authorize`).

| Key | Roles | Person (roll-eligible) |
|---|---|---|
| `admin` | UI, Voting Administrator | yes |
| `inspector` | UI, Election Inspector | yes |
| `member1`..`member4` | UI | yes (voters) |
| `outsider` | UI | no Person at all |
| `outsider-known` | UI | yes, never put on a wire roll |
| `trustee1`..`trustee3` | UI | yes |

Guest ballot sessions are never self-signed: `RequestGuestSession` posts a second-factor PIN (issued by
`Voting.IssueSecondFactorPins`) to `POST /vote/session`. Explorer-style magic-link sessions use the invite flow
(`CreateExplorerMagicLink`).

The test-only role `Voting Wire Guest` (created by provisioning, selected by the host through the edge's `GuestRoleName`
setting) holds only the three MJ reads a restricted role needs and **no voting entity grant**, as a guest session must
(`docs/voting/security.md`); provisioning revokes anything else it finds on the role.

## Ballot browser tier (`<mj-ballot>` in headless Chrome)

`test-harnesses/ballot-live.mjs` drives the public ballot (the element served by the `/vote` edge) in a real headless system
Chrome (Playwright, `channel: 'chrome'`, bundled chromium as a fallback). Each scenario builds its own election over the
wire as the `admin` persona (create, freeze roll, distribute, open, issue PINs), signs a voter in through the element UI,
and proves the outcome over the wire (turnout, participation, receipt verification), never from the screen alone. Every page
also has its console errors, page errors and CSP violations asserted to be zero (the few provoked 401/404s are allowlisted
per scenario, with the reason in the code).

```bash
VOTING_WIRE_RATE_MAX=2000 VOTING_WIRE_PORT=4107 VOTING_WIRE_RUN_DIR=$PWD/tmp/c1 node test-harnesses/host.mjs start   # your own host; the full run signs many voters in from one IP, so lift the per-IP edge limit (wire-edge tests the defaults)
pnpm wire:provision                                                                       # personas, once
VOTING_WIRE_PORT=4107 node test-harnesses/ballot-live.mjs                  # every scenario; exit 0 = all green
VOTING_WIRE_PORT=4107 node test-harnesses/ballot-live.mjs ranked embed     # scenarios whose id starts with these
HEADED=1 SHOT_DIR=/some/dir VOTING_WIRE_PORT=4107 node test-harnesses/ballot-live.mjs   # watch it; choose the screenshot dir
```

Needs the built `IntegrationTests` package (`pnpm wire:provision` builds it), the built element
(`pnpm run build` in `packages/AngularWidgets`; the host serves `dist-element/main.js` as it is on disk) and the repo `.env`.
`BALLOT_EMBED_PORT` (default 4199) is the tiny static server that embeds the element cross-origin
(`http://localhost:4199` is the allowed origin, `http://127.0.0.1:4199` the disallowed one). Output is `ok` / `FAIL` /
`BLOCKED` per scenario (`BLOCKED` = a known dependency outside the ballot, still counted as not passing).

| Id | Covers |
|---|---|
| `motion` | first-party host page: sign in, select, review, back, cast, receipt, events, reload, already-voted, second cast refused |
| `revote` | elections that allow re-voting: previous receipt shown, replacement does not add turnout |
| `plurality` `approval` `ranked` `referendum` `writein` `multicontest` `standards` | one per ballot style (ranked includes keyboard reordering and removal) |
| `validation` | undervote, overvote, ranked min, reorder keeps ranks valid, messages name contests |
| `auth` | wrong PIN, unknown key, lockout: all one generic message; other voters unaffected |
| `closed` | closed / not-yet-open / paused distributions are a 404 notice; a close during a session refuses the cast |
| `embed` | allowed origin works, disallowed origin refused (browser and edge), iframe `postMessage`, `frame-ancestors` |
| `a11y` `a11y-dark` `mobile` | keyboard-only ballot, labels, focus ring, axe (WCAG 2.x A/AA, light and dark), 360px layout |
| `language` | the `language` attribute does not break the ballot (the UI has English strings only) |
| `csp` | host-page CSP/headers, bundle headers, injected inline script blocked |
| `receipt` | "Verify a Receipt" in the element: after casting (prefilled, focus on the heading, empty and unknown codes, Enter submits, axe) and from the sign-in screen (explains the sign-in, opens the check first); a re-vote's replaced receipt reads "no longer counted", matching the wire |

## Explorer browser tier (`test-harnesses/explorer-live.mjs`)

Drives the Voting screens inside MJ Explorer in headless Chrome. Explorer runs from the MJ checkout with a local-only `voting`
build/serve configuration (`MJ/packages/MJExplorer/angular.json`, `src/environments/environment.voting.ts`: GraphQL -> :4105,
`AUTH_TYPE: 'magic-link'`) and `@mj-biz-apps/voting-ng` in `MJ/mj.config.cjs` `dynamicPackages.client`.

Every scenario signs a **provisioned persona** (`admin`, `inspector`, `member1`.., `trustee1`..) into Explorer through MJ's real
invite flow (`CreateExplorerMagicLink`; the role is `Voting Administrator` / `Election Inspector` / `UI`). That needs the host
started with `VOTING_TEST_HOST_RELAX_MAGIC_LINK=1` (test host only: `UI` becomes grantable and the provisioning guard warns
instead of blocking) and `VOTING_WIRE_EXPLORER_URL`. Each scenario drives the real UI, then proves the outcome **over the wire**
with the persona's own API key or the system key. Every page asserts zero page errors, console errors and failed responses;
the only tolerated noise is listed in `ENVIRONMENT_NOISE` with its reason (the M5 shell also loads the Orders app's client
code, whose `Event Products` reads 400 against this voting-only host).

```bash
VOTING_TEST_HOST_RELAX_MAGIC_LINK=1 VOTING_WIRE_EXPLORER_URL=http://localhost:4304 VOTING_WIRE_PORT=4105 \
  VOTING_WIRE_RUN_DIR=$PWD/tmp/c2 node test-harnesses/host.mjs start
(in MJ/packages/MJExplorer)  ng serve --configuration voting --port 4304
pnpm --filter @mj-biz-apps/voting-integration-tests run build
VOTING_WIRE_PORT=4105 node test-harnesses/explorer-live.mjs            # everything (~5 min); exit 0 = all green
VOTING_WIRE_PORT=4105 node test-harnesses/explorer-live.mjs flow       # the flow story only
```

Screenshots go to `tmp/explorer-shots` (`SHOT_DIR` overrides): named shots per step plus `end-<scenario>-<persona>.png`, the last
state of every page, which is the first thing to read when a scenario fails. The `flow-*` scenarios are one story sharing the
elections the wizard creates; `deeplinks` and `settings` reuse the newest certified `XP motion` / `XP board` when run alone.

| Id | Persona(s) | Covers (UI, then wire) |
|---|---|---|
| `shell-admin` `shell-inspector` `shell-member1` | each | shell boots into the Voting app, every nav item, "New election" only for the administrator |
| `external-limited` | new external email | a magic link granting `Voting Administrator` to an unknown email yields MJ's restricted shell ("No Applications Available"), no Voting nav |
| `flow-motion` | admin | wizard: Motion type, details, contest, inline CSV roll, review, create; Roll tab freeze; Overview "Open voting". Wire: name, Draft, contest kind, Yes/No options, unfrozen draft invisible to a member, frozen roll of 3, Open |
| `flow-board` | admin | wizard: Board Election, Office contest with 2 seats / max 2 and 3 candidates; freeze; open. Wire: kind, seats, candidates |
| `flow-draft-hidden` | member1 | an unfrozen draft is absent from Elections search, My Ballot and the Results picker; wire read (server RLS) returns nothing |
| `flow-member-vote` | member1 | My Ballot list -> ballot -> Yes -> review -> cast -> receipt; refresh shows "already voted". Wire: HasVoted, receipt verifies, turnout 1 |
| `flow-member-board` | member2, member4 | two directors cast; the list then shows "You have voted" + "View receipt". member4 (not on the roll) is not offered it; wire GetMyBallot refuses |
| `flow-member-rls` | member1 | member sees only Overview + Certification tabs and no lifecycle buttons; Settings is an administrators-only notice; open election's results hidden on screen and over the wire |
| `flow-close-tally` | admin, inspector | Close & Tally: close, tally (wire: Closed, Tallied); the inspector gets no close/tally actions |
| `flow-certify` | inspector | Results & Certification: certify both elections, confirmation shown. Wire: a Certified certification, election Certified |
| `flow-member-results` | member1 | certified outcomes (motion, board candidates) on screen; wire GetResults visible to the member |
| `lists` | admin | Elections search, status filter, type filter, clear, "no match"; every count equals the wire count (needs a quiet database: run it apart from tiers that create elections) |
| `deeplinks` | admin | selections write `electionId` / `tab` / `wizard` to the URL; refresh restores election + tab, Results selection and the wizard; back/forward walk tabs |
| `election-types` | admin | catalog loads, counts match the wire, configuration expands, every section tab |
| `settings` | admin | create, edit and retire a ballot distribution (each proven over the wire); embed snippet shows the slug |
| `trustee-share` | trustee1, trustee2 | high-assurance election (ceremony + votes + close over the wire); each trustee submits a share on Trustee Share, the form clears; wire tally succeeds with 2 of 3 shares |

Known MJ-shell behaviour (not Voting): on a cold page load Explorer restores an already-open tab from the **saved workspace**,
not from the URL's query params, and saves the workspace a few seconds after a change. A pasted deep link into a tab the user
already has open keeps the old selection, and a refresh within ~5 s of a change comes back one step behind. The harness
navigates through the UI and waits out the save before refreshing (`XP_RELOAD_WAIT`, default 6000 ms). Explorer also persists
each persona's workspace server side, so runs leave tabs in the personas' workspaces (the harness normalizes its landing view).
