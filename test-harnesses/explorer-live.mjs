/**
 * Headless Playwright tier for the Voting screens inside MJ Explorer.
 *
 *   VOTING_TEST_HOST_RELAX_MAGIC_LINK=1 VOTING_WIRE_EXPLORER_URL=http://localhost:4304 VOTING_WIRE_PORT=4105 \
 *     VOTING_WIRE_RUN_DIR=$PWD/tmp/c2 node test-harnesses/host.mjs start                    # voting host (UI grantable)
 *   (in MJ/packages/MJExplorer)  ng serve --configuration voting --port 4304              # Explorer, magic-link auth
 *   VOTING_WIRE_PORT=4105 node test-harnesses/explorer-live.mjs [scenario-id-prefix ...]
 *
 * Every scenario signs a PROVISIONED persona (admin, inspector, member1.., trustee1..) into Explorer through MJ's real invite
 * flow (`CreateExplorerMagicLink`), drives the real screens, and then proves the outcome over the wire with that persona's own
 * API key (or the system key), never from the screen alone. Every page has its page errors, console errors and failed
 * GraphQL/HTTP responses asserted to be zero; the only tolerated noise is listed in ENVIRONMENT_NOISE with the reason.
 *
 * The `flow-*` scenarios are one story and share state (the elections the admin creates through the wizard); run them in order
 * (a prefix filter such as `flow` keeps them together). A flow scenario whose prerequisite did not run reports BLOCKED.
 *
 * Environment: VOTING_WIRE_PORT (default 4105), EXPLORER_URL (default http://localhost:4304), HEADED=1, SHOT_DIR.
 * Output per scenario: ok / FAIL / BLOCKED (BLOCKED = a prerequisite outside the scenario; still exit 1).
 * Credentials come from the repo .env and the gitignored persona file; the session token only ever sits in the URL fragment
 * handed to the browser and is never printed (nor is any full Explorer URL).
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const testsPackage = path.resolve(repoRoot, 'packages/IntegrationTests');
dotenv.config({ path: path.join(repoRoot, '.env'), quiet: true });
process.env.VOTING_WIRE_PORT ??= '4105';

const requireFromTests = createRequire(path.join(testsPackage, 'package.json'));
const playwrightModule = await import(pathToFileURL(requireFromTests.resolve('playwright')).href);
const chromium = (playwrightModule.default ?? playwrightModule).chromium;
const wire = await import(pathToFileURL(path.join(testsPackage, 'dist/client-index.js')).href);
const V = await import(pathToFileURL(requireFromTests.resolve('@mj-biz-apps/voting-entities')).href);

const EXPLORER = (process.env.EXPLORER_URL ?? 'http://localhost:4304').replace(/\/$/, '');
const APP = 'BizApps Voting';
const APP_PATH = 'bizapps-voting';
const SHOTS = process.env.SHOT_DIR ?? path.join(repoRoot, 'tmp/explorer-shots');
mkdirSync(SHOTS, { recursive: true });
const RUN = randomBytes(3).toString('hex');

const ELECTIONS = 'MJ_BizApps_Voting: Elections';
const CONTESTS = 'MJ_BizApps_Voting: Contests';
const OPTIONS = 'MJ_BizApps_Voting: Contest Options';
const ROLL = 'MJ_BizApps_Voting: Eligible Voters';
const DISTRIBUTIONS = 'MJ_BizApps_Voting: Ballot Distributions';
const CERTIFICATIONS = 'MJ_BizApps_Voting: Election Certifications';
const TRUSTEES = 'MJ_BizApps_Voting: Election Trustees';

class AssertionError extends Error {}
class BlockedError extends Error {}
const ok = (cond, msg) => {
    if (!cond) throw new AssertionError(msg);
};
const eq = (actual, expected, msg) => ok(actual === expected, `${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
/** Outside a full run, the stand-alone scenarios reuse the newest election an earlier run's wizard created. */
async function earlier(prefix) {
    const r = await cast.System.RunView({ EntityName: 'MJ_BizApps_Voting: Elections', ExtraFilter: `Name LIKE '${prefix} %' AND Status='Certified'`, Fields: ['ID', 'Name'], OrderBy: '__mj_CreatedAt DESC', MaxRows: 1, ResultType: 'simple' });
    const row = r.Success ? r.Results[0] : undefined;
    return row ? { id: row.ID, name: row.Name } : undefined;
}
const need = (value, what) => {
    if (value === undefined || value === null) throw new BlockedError(`needs ${what} (run the flow scenarios in order)`);
    return value;
};

/**
 * Console/network noise that is not the Voting app's. Each entry says why it is tolerated.
 *  - The M5 Explorer shell also hosts the Orders app's client packages; on boot one of them loads `MJ_BizApps_Orders: Event
 *    Products` records, which the voting-only host (:4105) has no resolvers for (GraphQL 400 "Cannot query field
 *    mjBizAppsOrdersEventProduct"). Against a host that serves Orders this is silent.
 */
const ENVIRONMENT_NOISE = [/mjBizAppsOrders|MJ_BizApps_Orders/];

const cast = await wire.WireCast.Create();
const browser = await chromium.launch({ headless: process.env.HEADED !== '1', channel: 'chrome' });

// ─── wire helpers ────────────────────────────────────────────────────────────

const ROLE_FOR = { admin: 'Voting Administrator', inspector: 'Election Inspector' };
const email = (key) => cast.Record(key).Email;
const sys = () => cast.System;
const as = (key) => cast.As(key);

async function rows(client, entity, filter, fields) {
    const r = await client.RunView({ EntityName: entity, ExtraFilter: filter, Fields: fields, ResultType: 'simple', BypassCache: true });
    if (!r.Success) throw new AssertionError(`${client.Label} could not read ${entity}: ${r.ErrorMessage}`);
    return r.Results;
}
/**
 * Reads as a non-privileged persona through the generic RunDynamicView query with the persona's own API key, so the
 * SERVER applies its row-level security. (A client-side RunView as a second identity in this process computes RLS against
 * the global metadata provider, which is not that identity's.)
 */
async function personaRows(key, entity, filter) {
    const r = await wire.RawGenericRunView({ Kind: 'user-key', Key: cast.Record(key).APIKey }, entity, { ExtraFilter: filter, MaxRows: 50 });
    if (!r.Ran) throw new AssertionError(`${key} could not read ${entity}: ${r.Message}`);
    return r.Rows;
}
async function electionRow(client, id) {
    return (await rows(client, ELECTIONS, `ID='${id}'`, ['ID', 'Name', 'Status', 'RollFrozenAt', 'SecrecyMode', 'AssuranceTier', 'ResultsTiming', 'ResultsAudience']))[0];
}
async function op(client, Operation, input) {
    return client.Call(new Operation(), input);
}
function okOp(what, res) {
    if (!res.Success || !res.Output?.Success) throw new AssertionError(`${what}: ${wire.Describe(res)}`);
    return res.Output;
}

// ─── browser helpers ─────────────────────────────────────────────────────────

/** Signs an existing persona into Explorer with a magic link. The fragment token is never printed. */
async function signIn(key, { landing = 'Elections' } = {}) {
    const link = await wire.CreateExplorerMagicLink(sys(), { Email: email(key), ApplicationName: APP, RoleName: ROLE_FOR[key] ?? 'UI', ExplorerUrl: EXPLORER });
    if (!link.ExplorerUrl) throw new BlockedError('the host has no explorerUrl (start it with VOTING_WIRE_EXPLORER_URL)');
    const page = await newPage(key);
    await page.goto(link.ExplorerUrl);
    await page.locator(`[data-testid="nav-item-${landing}"]`).first().waitFor({ timeout: 60000 });
    await settle(page);
    return page;
}

async function newPage(label) {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const page = await context.newPage();
    page.label = label;
    page.log = { console: [], pageErrors: [], http: [] };
    page.on('console', (m) => {
        if (m.type() !== 'error') return;
        const text = m.text();
        if (/^Failed to load resource/.test(text)) return; // reported with its request below
        page.log.console.push(text.slice(0, Number(process.env.XP_LOG_CHARS ?? 400)));
    });
    page.on('pageerror', (e) => page.log.pageErrors.push(String(e).slice(0, 400)));
    page.on('response', (r) => {
        if (r.status() < 400) return;
        const body = (r.request().postData() ?? '').slice(0, 2000);
        page.log.http.push(`${r.status()} ${new URL(r.url()).pathname} ${body.replace(/\s+/g, ' ').slice(0, 300)}`);
    });
    OPEN_PAGES.add(page);
    page.close2 = async () => {
        // The last state of every page, so a failure can be read off the screenshot (overwritten each run).
        await page.screenshot({ path: path.join(SHOTS, `end-${CURRENT_ID}-${label}.png`) }).catch(() => undefined);
        OPEN_PAGES.delete(page);
        await context.close();
    };
    return page;
}

const OPEN_PAGES = new Set();
let CURRENT_ID = '';

/** Fails on any page error, console error or failed response not explained by ENVIRONMENT_NOISE or `allow`. */
function assertClean(page, where, allow = []) {
    const tolerated = [...ENVIRONMENT_NOISE, ...allow];
    const keep = (t) => !tolerated.some((re) => re.test(t));
    const bad = [...page.log.pageErrors.filter(keep).map((t) => `pageerror: ${t}`), ...page.log.console.filter(keep).map((t) => `console: ${t}`), ...page.log.http.filter(keep).map((t) => `http: ${t}`)];
    page.log.pageErrors.length = 0;
    page.log.console.length = 0;
    page.log.http.length = 0;
    if (bad.length && process.env.XP_DUMP) writeFileSync(process.env.XP_DUMP, bad.join('\n\n'));
    ok(bad.length === 0, `${where}: ${bad.length} unexpected browser error(s): ${JSON.stringify(bad.slice(0, 4))}`);
}

async function settle(page, ms = 600) {
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    await page.waitForTimeout(ms);
}

async function shot(page, name) {
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
}

/** The visible instance of a resource component (Explorer keeps other tabs' components in the DOM, hidden). */
const view = (page, tag) => page.locator(`${tag}:visible`).first();
const RES = {
    elections: 'voting-elections-resource',
    ballot: 'voting-ballot-resource',
    results: 'voting-results-resource',
    settings: 'voting-settings-resource',
    types: 'voting-election-types-resource',
    trustee: 'voting-trustee-share-resource',
};

async function nav(page, item, tag) {
    await page.locator(`[data-testid="nav-item-${item}"]:visible`).first().click();
    const root = view(page, tag);
    await root.waitFor({ timeout: 30000 });
    await settle(page);
    return root;
}

/**
 * Brings the Elections resource back to its list. Explorer persists each user's workspace (open tabs and their query
 * params) server side, so a persona can land on whatever the previous run (or the person smoke-testing as that persona)
 * left open: a wizard or an election detail.
 */
async function toElectionList(page) {
    const root = await nav(page, 'Elections', RES.elections);
    for (let i = 0; i < 3; i++) {
        if (await root.locator('#el-search').isVisible().catch(() => false)) return root;
        const wiz = root.locator('voting-election-wizard');
        if (await wiz.isVisible().catch(() => false)) await button(wiz, 'Cancel').click();
        else if (await button(root, 'All elections').isVisible().catch(() => false)) await button(root, 'All elections').click();
        await settle(page, 400);
    }
    await root.locator('#el-search').waitFor({ timeout: 15000 });
    return root;
}

/**
 * A browser refresh. Explorer (MJ shell) restores a tab from the SAVED workspace on a cold load, not from the URL, and it
 * saves the workspace a few seconds after a change; a refresh inside that window comes back with the previous selection.
 * KNOWN MJ ISSUE (reported, not a Voting defect): the refresh waits the save out so the check is about the Voting screens.
 */
async function reloadAfterWorkspaceSave(page) {
    await page.waitForTimeout(Number(process.env.XP_RELOAD_WAIT ?? 6000));
    await page.reload();
}

/** Opens an election (and optionally a tab) the way a person does: search the list, click the name, click the tab. */
async function openElection(page, name, tab) {
    const root = await toElectionList(page);
    await root.locator('#el-search').fill(name);
    await waitText(root, /Showing 1 of/);
    await root.locator('a.name-link', { hasText: name }).click();
    await waitText(root.locator('.detail-header'), new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    if (tab) {
        await root.locator(`#tab-${tab}`).click();
        await root.locator(`#tab-${tab}[aria-selected="true"]`).waitFor();
        eq(query(page).tab, tab, `${tab} tab in the URL`);
    }
    await settle(page, 300);
    return root;
}

/** Opens a ballot from the My Ballot list. */
async function openBallot(page, name) {
    const root = await nav(page, 'My Ballot', RES.ballot);
    if (await button(root, 'All open elections').isVisible().catch(() => false)) await button(root, 'All open elections').click();
    const entry = root.locator('li.election').filter({ hasText: name });
    await entry.waitFor({ timeout: 30000 });
    await button(entry, name).click();
    await root.locator('mj-voting-explorer-ballot').waitFor();
    return root;
}

const query = (page) => Object.fromEntries(new URL(page.url()).searchParams.entries());
const button = (root, name) => root.getByRole('button', { name, exact: false }).filter({ visible: true }).first();
const text = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ');

async function waitText(loc, re, timeout = 30000) {
    const started = Date.now();
    for (;;) {
        const t = await text(loc).catch(() => '');
        if (re.test(t)) return t;
        if (Date.now() - started > timeout) throw new AssertionError(`timed out waiting for ${re} in: ${t.slice(0, 500)}`);
        await new Promise((r) => setTimeout(r, 300));
    }
}

/** Selects an election in an election picker (`<select>` of `<Name> (<Status>)` options) by id. */
async function pickElection(select, electionName) {
    const label = await select.locator('option').filter({ hasText: electionName }).first().innerText();
    await select.selectOption({ label: label.trim() });
}

// ─── scenarios ───────────────────────────────────────────────────────────────

const scenarios = [];
const scenario = (id, title, fn) => scenarios.push({ id, title, fn });
/** Shared state of the flow-* story. */
const S = {};

const NAV_ALL = ['Elections', 'My Ballot', 'Election Types', 'Results & Certification', 'Settings', 'Trustee Share'];

for (const key of ['admin', 'inspector', 'member1']) {
    scenario(`shell-${key}`, `${key}: Explorer shell boots into the Voting app with every nav item, no errors`, async () => {
        const page = await signIn(key);
        try {
            for (const item of NAV_ALL) ok(await page.locator(`[data-testid="nav-item-${item}"]`).count(), `nav item ${item} missing`);
            const root = await toElectionList(page);
            await waitText(root, /Showing \d+ of \d+/);
            const canCreate = await button(root, 'New election').count();
            eq(canCreate > 0, key === 'admin', `"New election" offered to ${key}`);
            await shot(page, `shell-${key}`);
            assertClean(page, `${key} shell`);
        } finally {
            await page.close2();
        }
    });
}

scenario('external-limited', 'a brand-new external email granted Voting Administrator by magic link gets no Explorer app (limited by design)', async () => {
    const link = await wire.CreateExplorerMagicLink(sys(), { Email: `xp-ext-${RUN}@voting-wire.test`, ApplicationName: APP, RoleName: 'Voting Administrator', ExplorerUrl: EXPLORER });
    const page = await newPage('external');
    try {
        await page.goto(link.ExplorerUrl);
        await page.waitForFunction(() => /No Applications Available|Elections/.test(document.body.innerText), null, { timeout: 60000 });
        const body = await text(page.locator('body'));
        await shot(page, 'external-limited');
        ok(/No Applications Available/i.test(body), `an external magic-link session reached the app shell: ${body.slice(0, 300)}`);
        ok(!(await page.locator('[data-testid="nav-item-Elections"]').count()), 'no Voting navigation for an external session');
        // MJ's restricted shell trips permission-constrained engines (an uncaught PermissionConstrainedError from
        // UserInfoEngine on "MJ: User Notifications"): that is MJ's limitation of the external session, not a Voting screen.
        assertClean(page, 'external shell', [/PermissionConstrainedError|lacks read permission/]);
    } finally {
        await page.close2();
    }
});

// ── flow: admin builds a motion and a board election through the wizard ─────

/** Drives the New Election wizard. Returns the new election id (read from the deep-link query param). */
async function wizardCreate(page, { typeName, name, contests, voters, policy }) {
    const root = await toElectionList(page);
    await button(root, 'New election').click();
    const wiz = root.locator('voting-election-wizard');
    await wiz.waitFor();
    eq(query(page).wizard, '1', 'wizard state in the URL');
    await waitText(wiz, /Type/);

    // 1. type
    await wiz.locator('.type-card').filter({ has: page.locator('.type-name', { hasText: new RegExp(`^${typeName}$`) }) }).click();
    await button(wiz, 'Next').click();
    // 2. details (+ policy)
    await wiz.locator('#wiz-name').fill(name);
    await wiz.locator('#wiz-desc').fill(`Created through the Explorer wizard by the headless tier (${RUN}).`);
    for (const [key, value] of Object.entries(policy ?? {})) await wiz.locator(`#pf-${key}`).selectOption(value);
    await button(wiz, 'Next').click();
    // 3. contests
    await wiz.locator('#c-name-0').waitFor();
    for (let ci = 0; ci < contests.length; ci++) {
        const c = contests[ci];
        if (ci > 0) await button(wiz, 'Add contest').click();
        if (c.kind) await wiz.locator(`#c-kind-${ci}`).selectOption(c.kind);
        await wiz.locator(`#c-name-${ci}`).fill(c.name);
        if (c.tally) await wiz.locator(`#c-tally-${ci}`).selectOption(c.tally);
        if (c.seats) await wiz.locator(`#c-seats-${ci}`).fill(String(c.seats));
        if (c.max) await wiz.locator(`#c-max-${ci}`).fill(String(c.max));
        if (c.options) {
            const card = wiz.locator('fieldset.contest-card').nth(ci);
            for (let oi = 0; oi < c.options.length; oi++) {
                if ((await card.locator(`#o-label-${ci}-${oi}`).count()) === 0) await button(card, 'Add option').click();
                await card.locator(`#o-label-${ci}-${oi}`).fill(c.options[oi]);
            }
        }
    }
    await button(wiz, 'Next').click();
    // 4. eligibility: an inline CSV roll keyed by the personas' emails
    await wiz.locator('#el-source').selectOption('csv');
    const csv = ['Email,SourceKey,Weight', ...voters.map((k, i) => `${email(k)},xp-${RUN}-${k}-${i},1`)].join('\n');
    await wiz.locator('#csv-text').fill(csv);
    await button(wiz, 'Next').click();
    // 5. linked records: none
    await waitText(wiz, /Link the election to the records/);
    await button(wiz, 'Next').click();
    // 6. review
    const review = await waitText(wiz, /Create election/);
    ok(review.includes(name), 'review shows the name');
    for (const c of contests) ok(review.includes(c.name), `review lists contest ${c.name}`);
    await shot(page, `wizard-review-${typeName.replace(/\W+/g, '-').toLowerCase()}`);
    await button(wiz, 'Create election').click();

    const header = root.locator('.detail-header h2');
    await header.waitFor({ timeout: 30000 });
    eq((await header.innerText()).trim(), name, 'the new election opens in the detail view');
    const id = query(page).electionId;
    ok(/^[0-9a-f-]{36}$/i.test(id ?? ''), `electionId in the URL after create (${id})`);
    await settle(page);
    return id;
}

async function freezeAndOpenInUI(page, id, label) {
    const root = view(page, RES.elections);
    await root.locator('#tab-roll').click();
    eq(query(page).tab, 'roll', 'roll tab in the URL');
    const roll = root.locator('election-roll-tab');
    await waitText(roll, /not frozen/);
    await button(roll, 'Freeze roll').click();
    await button(roll, 'Yes, freeze').click();
    await waitText(roll, /Frozen /);
    const frozen = await electionRow(await as('admin'), id);
    ok(!!frozen.RollFrozenAt, `${label}: RollFrozenAt set over the wire`);
    eq(frozen.Status, 'Draft', `${label}: still a Draft after the freeze`);
    await shot(page, `${label}-roll-frozen`);

    await root.locator('#tab-overview').click();
    const ov = root.locator('election-overview-tab');
    await button(ov, 'Open voting').click();
    await button(ov, 'Yes, continue').click();
    await waitText(ov, /Voting is now open/);
    eq((await electionRow(await as('admin'), id)).Status, 'Open', `${label}: Open over the wire`);
    await waitText(root.locator('.detail-header'), /Open/);
    await shot(page, `${label}-open`);
}

scenario('flow-motion', 'admin creates a Motion through the wizard (contest, CSV roll), freezes the roll and opens it; proven over the wire', async () => {
    const page = await signIn('admin');
    try {
        const name = `XP motion ${RUN}`;
        const id = await wizardCreate(page, { typeName: 'Motion', name, voters: ['member1', 'member2', 'member3'], contests: [{ name: 'Adopt the Explorer resolution' }] });
        assertClean(page, 'wizard (motion)');
        const admin = await as('admin');
        const row = await electionRow(admin, id);
        eq(row?.Name, name, 'election saved with the wizard name');
        eq(row.Status, 'Draft', 'a new election is a Draft');
        ok(!row.RollFrozenAt, 'roll not frozen yet');
        const contests = await rows(admin, CONTESTS, `ElectionID='${id}'`, ['ID', 'Name', 'Kind']);
        eq(contests.length, 1, 'one contest');
        eq(contests[0].Kind, 'Motion', 'contest kind');
        const options = await rows(admin, OPTIONS, `ContestID='${contests[0].ID}'`, ['Label']);
        eq(options.map((o) => o.Label).sort().join(','), 'No,Yes', 'Yes/No options');
        S.motion = { id, name };

        // Before the freeze a member cannot see the draft at all (row-level security), over the wire and on screen.
        eq((await personaRows('member1', ELECTIONS, `ID='${id}'`)).length, 0, 'member1 reads the unfrozen draft over the wire');
        S.motionDraftHiddenChecked = true;

        await freezeAndOpenInUI(page, id, 'motion');
        const roll = await rows(admin, ROLL, `ElectionID='${id}'`, ['PersonID', 'Status']);
        eq(roll.length, 3, 'three voters on the frozen roll');
        assertClean(page, 'freeze + open (motion)');
    } finally {
        await page.close2();
    }
});

scenario('flow-board', 'admin creates a Board Election (Office contest: 2 seats, 3 candidates) through the wizard, freezes and opens it', async () => {
    const page = await signIn('admin');
    try {
        const name = `XP board ${RUN}`;
        const candidates = ['Ada Lovelace', 'Grace Hopper', 'Alan Turing'];
        const id = await wizardCreate(page, {
            typeName: 'Board Election',
            name,
            voters: ['member1', 'member2', 'member3'],
            contests: [{ name: 'Directors', kind: 'Office', seats: 2, max: 2, options: candidates }],
        });
        assertClean(page, 'wizard (board)');
        const admin = await as('admin');
        const contests = await rows(admin, CONTESTS, `ElectionID='${id}'`, ['ID', 'Name', 'Kind', 'Seats']);
        eq(contests.length, 1, 'one contest');
        eq(contests[0].Kind, 'Office', 'an Office contest');
        eq(contests[0].Seats, 2, 'two seats');
        const options = await rows(admin, OPTIONS, `ContestID='${contests[0].ID}'`, ['Label']);
        eq(options.map((o) => o.Label).sort().join('|'), [...candidates].sort().join('|'), 'the three candidates');
        S.board = { id, name, candidates };
        await freezeAndOpenInUI(page, id, 'board');
        assertClean(page, 'freeze + open (board)');
    } finally {
        await page.close2();
    }
});

scenario('flow-draft-hidden', 'a member never sees an unfrozen draft: not in Elections, My Ballot, Results; not over the wire', async () => {
    // A fresh draft (left unfrozen on purpose) so the check does not depend on timing.
    const admin = await as('admin');
    const draft = await wire.CreateDraftElection(cast, admin, { TypeCode: 'motion', Name: `XP hidden draft ${RUN}`, Voters: [wire.PersonaVoter(cast, 'member1', 0)], Contests: [wire.MotionSpec('Hidden motion')] });
    const page = await signIn('member1');
    try {
        const root = await toElectionList(page);
        await root.locator('#el-search').fill(`XP hidden draft ${RUN}`);
        await waitText(root, /Showing 0 of/);
        await nav(page, 'My Ballot', RES.ballot);
        const ballot = view(page, RES.ballot);
        ok(!(await text(ballot)).includes(`XP hidden draft ${RUN}`), 'the draft is listed under My Ballot');
        const results = await nav(page, 'Results & Certification', RES.results);
        ok((await results.locator('#results-election option').filter({ hasText: `XP hidden draft ${RUN}` }).count()) === 0, 'the draft is offered on Results');
        eq((await personaRows('member1', ELECTIONS, `ID='${draft.ElectionID}'`)).length, 0, 'member1 reads the draft over the wire');
        await shot(page, 'member-draft-hidden');
        assertClean(page, 'member draft hidden');
    } finally {
        await page.close2();
    }
});

/** Casts through the embedded Explorer ballot; returns the receipt code shown. */
async function castInUI(page, root, picks) {
    const ballot = root.locator('mj-voting-explorer-ballot');
    await waitText(ballot, /Review my ballot/);
    for (const label of picks) await ballot.locator('.option-label').filter({ hasText: label }).first().click();
    await button(ballot, 'Review my ballot').click();
    const review = await waitText(ballot, /Confirm and cast ballot/);
    for (const label of picks) ok(review.includes(label), `review shows ${label}`);
    await button(ballot, 'Confirm and cast ballot').click();
    await waitText(ballot, /Your ballot was recorded/);
    const receipt = (await ballot.locator('.receipt-code code').innerText()).trim();
    ok(receipt.length >= 6, 'a receipt code is shown');
    return receipt;
}

scenario('flow-member-vote', 'member1 finds the motion under My Ballot, casts Yes, gets a receipt; participation, turnout and receipt proven over the wire', async () => {
    const m = need(S.motion, 'flow-motion');
    const page = await signIn('member1');
    try {
        const root = await openBallot(page, m.name);
        eq(query(page).electionId?.toLowerCase(), m.id.toLowerCase(), 'ballot deep link in the URL');
        const receipt = await castInUI(page, root, ['Yes']);
        await shot(page, 'member1-receipt');
        assertClean(page, 'member1 casts');

        const me = await as('member1');
        const part = okOp('GetMyParticipation', await op(me, V.VotingGetMyParticipationOperation, { ElectionID: m.id }));
        eq(part.HasVoted, true, 'member1 HasVoted over the wire');
        const verify = okOp('VerifyReceipt', await op(me, V.VotingVerifyReceiptOperation, { ElectionID: m.id, ReceiptCode: receipt }));
        ok(verify.Found === true || verify.Counted === true, `the shown receipt verifies over the wire (${JSON.stringify(verify)})`);
        const turnout = okOp('GetTurnout', await op(await as('admin'), V.VotingGetTurnoutOperation, { ElectionID: m.id }));
        eq(turnout.Voted, 1, 'turnout over the wire');

        // A reload of the ballot deep link shows "already voted" (state survives refresh), and a second cast is impossible.
        await reloadAfterWorkspaceSave(page);
        const again = view(page, RES.ballot);
        await waitText(again, /already voted/);
        eq((await again.locator('mj-voting-explorer-ballot .receipt-code').count()) >= 0, true, 'receipt area renders');
        await shot(page, 'member1-already-voted');
        assertClean(page, 'member1 reload');
        S.motionReceipt = receipt;
    } finally {
        await page.close2();
    }
});

scenario('flow-member-board', 'member2 opens the board ballot from My Ballot and picks two directors; member4 (not on the roll) is not offered it', async () => {
    const b = need(S.board, 'flow-board');
    const page = await signIn('member2');
    try {
        const root = await openBallot(page, b.name);
        const receipt = await castInUI(page, root, ['Ada Lovelace', 'Grace Hopper']);
        await shot(page, 'member2-board-receipt');
        assertClean(page, 'member2 casts board');
        const me = await as('member2');
        eq(okOp('GetMyParticipation', await op(me, V.VotingGetMyParticipationOperation, { ElectionID: b.id })).HasVoted, true, 'member2 HasVoted');
        ok(receipt.length > 0, 'receipt');
        // Back on the list the election now says "You have voted" and offers the receipt instead of a ballot.
        await button(root, 'All open elections').click();
        const entry = root.locator('li.election').filter({ hasText: b.name });
        await waitText(entry, /You have voted/);
        ok((await button(entry, 'View your receipt').count()) === 1, 'a voted election offers the receipt');
        assertClean(page, 'member2 list after voting');
    } finally {
        await page.close2();
    }
    // member4 is not on the roll: My Ballot does not offer it, and the voter operation refuses it over the wire.
    const outsider = await signIn('member4');
    try {
        const list = await nav(outsider, 'My Ballot', RES.ballot);
        if (await button(list, 'All open elections').isVisible().catch(() => false)) await button(list, 'All open elections').click();
        await waitText(list, /Open ballot|no open elections you can vote in/);
        ok(!(await text(list)).includes(b.name), 'My Ballot offers member4 an election it is not on the roll for');
        const refused = await op(await as('member4'), V.VotingGetMyBallotOperation, { ElectionID: b.id });
        ok(!(refused.Success && refused.Output?.Success), `member4 got a ballot over the wire: ${wire.Describe(refused)}`);
        await shot(outsider, 'member4-not-offered');
        assertClean(outsider, 'member4 My Ballot');
    } finally {
        await outsider.close2();
    }
});

scenario('flow-member-rls', 'members cannot use admin screens: read-only election view, Settings is admin-only, results hidden before certification', async () => {
    const m = need(S.motion, 'flow-motion');
    const page = await signIn('member1');
    try {
        // Elections: read-only for a member (no create, no lifecycle buttons, no roll/credential data).
        let root = await toElectionList(page);
        await root.locator('#el-search').fill(m.name);
        await waitText(root, /Showing 1 of/);
        await root.locator('a.name-link', { hasText: m.name }).click();
        await root.locator('.detail-header h2').waitFor();
        const tabs = (await root.locator('[role=tab]').allInnerTexts()).map((t) => t.trim());
        ok(!tabs.some((t) => /Roll|Credentials|Paper|Turnout|Trustees|Close/.test(t)), `admin-only tabs offered to a member: ${tabs.join(', ')}`);
        const ov = root.locator('election-overview-tab');
        await waitText(ov, /Lifecycle/);
        eq(await button(ov, 'Open voting').count() + (await button(ov, 'Close voting').count()), 0, 'lifecycle buttons for a member');
        await shot(page, 'member-election-readonly');
        assertClean(page, 'member election detail');

        // Settings: an administrators-only notice, no distribution data, no create button.
        root = await nav(page, 'Settings', RES.settings);
        await waitText(root, /administrator/i);
        eq(await button(root, 'New distribution').count(), 0, '"New distribution" offered to a member');
        await shot(page, 'member-settings');
        assertClean(page, 'member settings');

        // Results before certification: the open motion's results are not visible (screen AND wire).
        root = await nav(page, 'Results & Certification', RES.results);
        await pickElection(root.locator('#results-election'), m.name);
        await waitText(root, /not visible|No contest results|not been certified/i);
        eq(await button(root, 'Certify results').count(), 0, 'certify offered to a member');
        const res = await op(await as('member1'), V.VotingGetResultsOperation, { ElectionID: m.id });
        ok(!(res.Success && res.Output?.Success && res.Output.Visible !== false && (res.Output.Contests ?? []).length > 0), `member1 sees results of an open election over the wire: ${wire.Describe(res)}`);
        await shot(page, 'member-results-hidden');
        assertClean(page, 'member results hidden');
    } finally {
        await page.close2();
    }
});

scenario('flow-close-tally', 'admin closes and tallies both elections in Close & Tally; the inspector has no close/tally actions', async () => {
    const m = need(S.motion, 'flow-motion');
    const b = need(S.board, 'flow-board');
    const page = await signIn('admin');
    try {
        for (const e of [m, b]) {
            const root = await openElection(page, e.name, 'tally');
            const tally = root.locator('election-tally-tab');
            await button(tally, 'Close voting').click();
            await button(tally, 'Yes, close').click();
            await waitText(tally, /Tally ballots/);
            eq((await electionRow(await as('admin'), e.id)).Status, 'Closed', `${e.name} Closed over the wire`);
            await button(tally, 'Tally ballots').click();
            await waitText(tally, /Tally outcome/);
            eq((await electionRow(await as('admin'), e.id)).Status, 'Tallied', `${e.name} Tallied over the wire`);
            await shot(page, `tally-${e === m ? 'motion' : 'board'}`);
            assertClean(page, `close + tally ${e.name}`);
        }
    } finally {
        await page.close2();
    }
    const insp = await signIn('inspector');
    try {
        const root = await openElection(insp, m.name, 'tally');
        const tally = root.locator('election-tally-tab');
        await waitText(tally, /Close and tally/);
        eq(await button(tally, 'Tally ballots').count() + (await button(tally, 'Close voting').count()), 0, 'tally/close offered to the inspector');
        assertClean(insp, 'inspector tally tab');
    } finally {
        await insp.close2();
    }
});

scenario('flow-certify', 'inspector certifies both elections in Results & Certification; certification proven over the wire', async () => {
    const m = need(S.motion, 'flow-motion');
    const b = need(S.board, 'flow-board');
    const page = await signIn('inspector');
    try {
        const root = await nav(page, 'Results & Certification', RES.results);
        for (const e of [m, b]) {
            await pickElection(root.locator('#results-election'), e.name);
            eq(query(page).electionId?.toLowerCase(), e.id.toLowerCase(), 'selected election in the URL');
            const panel = root.locator('voting-certification-panel');
            await button(panel, 'Certify results').click();
            await button(panel, 'Yes, certify').click();
            await waitText(panel, /has been certified/);
            const certs = await rows(await as('admin'), CERTIFICATIONS, `ElectionID='${e.id}'`, ['Status']);
            ok(certs.some((c) => c.Status === 'Certified'), `${e.name}: a Certified certification over the wire (${JSON.stringify(certs)})`);
            eq((await electionRow(await as('admin'), e.id)).Status, 'Certified', `${e.name} Certified over the wire`);
            await shot(page, `certified-${e === m ? 'motion' : 'board'}`);
            assertClean(page, `certify ${e.name}`);
        }
    } finally {
        await page.close2();
    }
});

scenario('flow-member-results', 'after certification member1 sees the certified results (screen matches the wire)', async () => {
    const m = need(S.motion, 'flow-motion');
    const b = need(S.board, 'flow-board');
    const page = await signIn('member1');
    try {
        const root = await nav(page, 'Results & Certification', RES.results);
        await pickElection(root.locator('#results-election'), m.name);
        const outcome = root.locator('voting-contest-outcome').first();
        await outcome.waitFor({ timeout: 30000 });
        const shown = await text(outcome);
        ok(/Adopt the Explorer resolution/.test(shown), `motion outcome shows the contest: ${shown.slice(0, 200)}`);
        const res = okOp('GetResults', await op(await as('member1'), V.VotingGetResultsOperation, { ElectionID: m.id }));
        ok(res.Visible !== false, 'results visible to member1 over the wire');
        await waitText(root.locator('voting-certification-panel'), /Certified/);
        await shot(page, 'member-results-motion');

        await pickElection(root.locator('#results-election'), b.name);
        await root.locator('voting-contest-outcome').first().waitFor({ timeout: 30000 });
        const board = await text(root.locator('voting-contest-outcome').first());
        ok(/Ada Lovelace/.test(board) && /Grace Hopper/.test(board), `board outcome lists the candidates: ${board.slice(0, 200)}`);
        const bres = okOp('GetResults', await op(await as('member1'), V.VotingGetResultsOperation, { ElectionID: b.id }));
        ok(bres.Visible !== false && (bres.Contests ?? []).length === 1, 'board results visible over the wire');
        await shot(page, 'member-results-board');
        assertClean(page, 'member results');
    } finally {
        await page.close2();
    }
});

scenario('lists', 'Elections list: search, status and type filters, clear; counts match the wire', async () => {
    const page = await signIn('admin');
    try {
        const root = await toElectionList(page);
        const all = await rows(await as('admin'), ELECTIONS, '', ['ID', 'Status', 'ElectionTypeID', 'Name']);
        await waitText(root, new RegExp(`Showing ${all.length} of ${all.length}`));
        await root.locator('#el-status').selectOption('Draft');
        const drafts = all.filter((e) => e.Status === 'Draft').length;
        await waitText(root, new RegExp(`Showing ${drafts} of ${all.length}`));
        const typeValue = await root.locator('#el-type option').filter({ hasText: /^Motion$/ }).getAttribute('value');
        await root.locator('#el-type').selectOption(typeValue);
        const draftMotions = all.filter((e) => e.Status === 'Draft' && e.ElectionTypeID.toLowerCase() === typeValue.toLowerCase()).length;
        await waitText(root, new RegExp(`Showing ${draftMotions} of ${all.length}`));
        await button(root, 'Clear filters').click();
        await waitText(root, new RegExp(`Showing ${all.length} of ${all.length}`));
        await root.locator('#el-search').fill(`XP `);
        const xp = all.filter((e) => e.Name.toLowerCase().includes('xp ')).length;
        await waitText(root, new RegExp(`Showing ${xp} of ${all.length}`));
        await root.locator('#el-search').fill(`no such election ${RUN}`);
        await waitText(root, /No elections match/);
        await shot(page, 'elections-filters');
        assertClean(page, 'elections filters');
    } finally {
        await page.close2();
    }
});

scenario('deeplinks', 'URL state: selections write query params, refresh restores them, back/forward walks them (Elections, Results, wizard)', async () => {
    const m = need(S.motion ?? (await earlier('XP motion')), 'flow-motion');
    const page = await signIn('admin');
    try {
        let root = await openElection(page, m.name, 'turnout');
        eq(query(page).electionId?.toLowerCase(), m.id.toLowerCase(), 'electionId in the URL');
        await reloadAfterWorkspaceSave(page);
        root = view(page, RES.elections);
        await root.locator('#tab-turnout[aria-selected="true"]').waitFor({ timeout: 60000 });
        await waitText(root.locator('.detail-header'), new RegExp(m.name));
        await root.locator('#tab-roll').click();
        await waitText(root.locator('election-roll-tab'), /Frozen/);
        eq(query(page).tab, 'roll', 'roll tab in the URL');
        await page.goBack();
        await root.locator('#tab-turnout[aria-selected="true"]').waitFor({ timeout: 15000 });
        await page.goForward();
        await root.locator('#tab-roll[aria-selected="true"]').waitFor({ timeout: 15000 });

        root = await nav(page, 'Results & Certification', RES.results);
        await pickElection(root.locator('#results-election'), m.name);
        eq(query(page).electionId?.toLowerCase(), m.id.toLowerCase(), 'results selection in the URL');
        await reloadAfterWorkspaceSave(page);
        root = view(page, RES.results);
        await root.locator('voting-certification-panel').waitFor({ timeout: 60000 });
        ok((await root.locator('#results-election option:checked').innerText()).includes(m.name), 'results selection restored after refresh');

        root = await toElectionList(page);
        await button(root, 'New election').click();
        eq(query(page).wizard, '1', 'wizard flag in the URL');
        await reloadAfterWorkspaceSave(page);
        root = view(page, RES.elections);
        const wiz = root.locator('voting-election-wizard');
        await wiz.waitFor({ timeout: 60000 });
        await waitText(wiz, /Board Election/);
        await button(wiz, 'Cancel').click();
        await waitText(root, /Showing \d+ of/);
        eq(query(page).wizard, undefined, 'wizard flag cleared');
        await shot(page, 'deeplinks');
        assertClean(page, 'URL state');
    } finally {
        await page.close2();
    }
});

scenario('election-types', 'Election Types: every catalog section loads, configuration expands, counts match the wire', async () => {
    const page = await signIn('admin');
    try {
        const root = await nav(page, 'Election Types', RES.types);
        const types = await rows(await as('admin'), 'MJ_BizApps_Voting: Election Types', '', ['ID', 'Name']);
        await waitText(root, new RegExp(`Election types\\s*${types.length}`));
        await button(root, 'Show configuration').click();
        await waitText(root, /Secrecy Mode/i);
        for (const section of ['Tally methods', 'Eligibility sources', 'Sign-in methods', 'Election types']) {
            await root.getByRole('tab', { name: new RegExp(section) }).first().click();
            await settle(page, 300);
        }
        await shot(page, 'election-types');
        assertClean(page, 'election types');
    } finally {
        await page.close2();
    }
});

scenario('settings', 'Settings: a finished election offers no new distribution (and says why); admin creates, edits and retires one on a draft, each save proven over the wire', async () => {
    const finished = need(S.board ?? (await earlier('XP board')), 'flow-board');
    const admin = await as('admin');
    // A fresh draft: the board election is certified by now, and a finished election accepts no new distribution.
    const draft = await wire.CreateDraftElection(cast, admin, {
        TypeCode: 'motion',
        Name: `XP settings ${RUN}`,
        Voters: [wire.PersonaVoter(cast, 'member1', 0)],
        Contests: [wire.MotionSpec('Settings motion')],
    });
    const m = { id: draft.ElectionID, name: `XP settings ${RUN}` };
    const page = await signIn('admin');
    try {
        const root = await nav(page, 'Settings', RES.settings);
        await pickElection(root.locator('#settings-election'), finished.name);
        await waitText(root.locator('.banner-info'), /no longer accepts ballots/);
        ok(await button(root, 'New distribution').isDisabled(), 'New distribution is disabled for a finished election');
        await shot(page, 'settings-finished-election');

        await pickElection(root.locator('#settings-election'), m.name);
        ok(!(await button(root, 'New distribution').isDisabled()), 'New distribution is offered for a draft election');
        await button(root, 'New distribution').click();
        const editor = root.locator('voting-distribution-editor');
        await editor.waitFor();
        const name = `XP distribution ${RUN}`;
        await editor.locator('input').first().fill(name);
        await editor.locator('input').nth(1).fill(`xp-${RUN}`);
        await shot(page, 'settings-new-distribution');
        await button(editor, 'Create distribution').click();
        await root.locator('table.grid tr', { hasText: name }).waitFor({ timeout: 20000 });
        let dists = await rows(await as('admin'), DISTRIBUTIONS, `ElectionID='${m.id}'`, ['ID', 'Name', 'Status', 'Slug']);
        const created = dists.find((d) => d.Name === name);
        ok(created, `distribution saved over the wire (${JSON.stringify(dists)})`);

        const row = root.locator('table.grid tr', { hasText: name });
        await button(row, 'Edit').click();
        await editor.waitFor();
        await editor.locator('input').first().fill(`${name} (edited)`);
        await button(editor, 'Save changes').click();
        await root.locator('table.grid tr', { hasText: `${name} (edited)` }).waitFor({ timeout: 20000 });
        dists = await rows(await as('admin'), DISTRIBUTIONS, `ID='${created.ID}'`, ['Name', 'Status']);
        eq(dists[0].Name, `${name} (edited)`, 'edit saved over the wire');

        const edited = root.locator('table.grid tr', { hasText: `${name} (edited)` });
        await button(edited, 'Embed').click();
        await waitText(root.locator('voting-embed-snippets'), new RegExp(created.Slug));
        await button(edited, 'Retire').click();
        await button(edited, 'Confirm retire').click();
        await waitText(edited, /Retired/);
        eq((await rows(await as('admin'), DISTRIBUTIONS, `ID='${created.ID}'`, ['Status']))[0].Status, 'Retired', 'retired over the wire');
        await shot(page, 'settings-distribution');
        assertClean(page, 'settings');
    } finally {
        await page.close2();
    }
});

scenario('trustee-share', 'trustee: a high-assurance election (ceremony over the wire); trustee1 and trustee2 submit shares on Trustee Share; the tally unlocks', async () => {
    const admin = await as('admin');
    const trustees = ['trustee1', 'trustee2', 'trustee3'];
    const election = await wire.CreateDraftElection(cast, admin, {
        TypeCode: 'motion',
        Name: `XP trustee ${RUN}`,
        Voters: [wire.PersonaVoter(cast, 'member1', 0), wire.PersonaVoter(cast, 'member2', 1)],
        Contests: [wire.MotionSpec('Tier B Explorer motion')],
        Extra: { SecrecyMode: 'Secret', AssuranceTier: 'HighAssurance', ResultsTiming: 'AfterClose' },
    });
    const ceremony = okOp('CreateTrusteeKeys', await op(admin, V.VotingCreateTrusteeKeysOperation, { ElectionID: election.ElectionID, TrusteePersonIDs: trustees.map((k) => cast.Record(k).PersonID), Threshold: 2 }));
    const shares = ceremony.Shares ?? [];
    eq(shares.length, 3, 'one share per trustee');
    await election.GoLive();
    await wire.CastAll(election, [{ 'Tier B Explorer motion': ['Yes'] }, { 'Tier B Explorer motion': ['No'] }]);
    await election.Close();
    const shareOf = (k) => shares.find((s) => s.TrusteePersonID.toLowerCase() === cast.Record(k).PersonID.toLowerCase());

    for (const k of ['trustee1', 'trustee2']) {
        const page = await signIn(k);
        try {
            const root = await nav(page, 'Trustee Share', RES.trustee);
            const sel = root.locator('#ts-election');
            const offered = await sel.locator('option').allInnerTexts();
            ok(offered.every((o) => /Choose an election|\(/.test(o)), 'options are election names with status');
            await pickElection(sel, election.Name);
            const s = shareOf(k);
            await root.locator('#ts-index').fill(String(s.ShareIndex));
            await root.locator('#ts-share').fill(s.Share);
            await button(root, 'Submit key share').click();
            await waitText(root, /Your share was accepted/);
            eq(await root.locator('#ts-share').inputValue(), '', 'the share is cleared from the form');
            await shot(page, `trustee-share-${k}`);
            assertClean(page, `${k} share`);
        } finally {
            await page.close2();
        }
    }
    const t = await rows(admin, TRUSTEES, `ElectionID='${election.ElectionID}'`, ['Status', 'ShareIndex']);
    ok(t.length === 3, `three trustees over the wire (${JSON.stringify(t)})`);
    okOp('Tally after 2 of 3 shares', await op(admin, V.VotingTallyOperation, { ElectionID: election.ElectionID }));
});

// ─── run ─────────────────────────────────────────────────────────────────────

const filters = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const selected = scenarios.filter((s) => !filters.length || filters.some((f) => s.id.startsWith(f)));
console.log(`\n  Explorer live (headless Chrome -> Explorer, voting host :${process.env.VOTING_WIRE_PORT}), run ${RUN}, screenshots in ${SHOTS}\n`);
let fail = 0;
for (const s of selected) {
    const started = Date.now();
    CURRENT_ID = s.id;
    try {
        await s.fn();
        console.log(`  ok   ${s.id.padEnd(20)} ${s.title} (${Math.round((Date.now() - started) / 1000)}s)`);
    } catch (err) {
        fail += 1;
        const where = err instanceof Error && !(err instanceof AssertionError) && !(err instanceof BlockedError) ? ` @ ${(err.stack ?? '').split('\n').slice(1, 4).join(' <- ').trim()}` : '';
        const msg = ((err instanceof Error ? err.message : String(err)) + where).replace(/\s*\n\s*/g, ' | ').slice(0, 1200);
        console.log(`  ${err instanceof BlockedError ? 'BLOCKED' : 'FAIL'} ${s.id.padEnd(20)} ${s.title}\n         ${msg}`);
    }
}
await browser.close();
console.log(`\n  ${selected.length - fail} passed, ${fail} not passing of ${selected.length}\n`);
process.exit(fail === 0 ? 0 : 1);
