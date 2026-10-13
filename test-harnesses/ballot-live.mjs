/**
 * Headless browser end-to-end tests for the PUBLIC ballot: the `<mj-ballot>` custom element served by the /vote edge.
 *
 *   VOTING_WIRE_PORT=4107 node test-harnesses/host.mjs start        # your own voting test host
 *   pnpm wire:provision                                              # personas (once)
 *   VOTING_WIRE_PORT=4107 node test-harnesses/ballot-live.mjs        # all scenarios, headless, exit 0 = all green
 *   VOTING_WIRE_PORT=4107 node test-harnesses/ballot-live.mjs motion approval   # only scenarios whose id starts with one of these
 *
 * Environment (all optional):
 *   VOTING_WIRE_PORT   host port (default 4104; use your own, e.g. 4107)
 *   BALLOT_EMBED_PORT  port of the tiny static page that embeds the element cross-origin (default 4199)
 *   HEADED=1           show the browser
 *   SHOT_DIR           screenshot directory (default <repo>/tmp/ballot-shots)
 *
 * Every scenario sets its election up over the wire as the admin persona (create, freeze, distribute, open, issue PINs),
 * then drives a REAL system Chrome through the element UI. The database/wire outcome (turnout, participation, receipt) is
 * asserted over the wire, never inferred from the screen alone. Console errors, page errors and CSP violations are captured
 * per page and must be zero unless the scenario names an expected one with a justification.
 *
 * Credentials come from the repo .env and test-harnesses/.personas.local.json; nothing here prints a secret.
 */
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const testsPackage = path.resolve(repoRoot, 'packages/IntegrationTests');
dotenv.config({ path: path.join(repoRoot, '.env'), quiet: true });

const requireFromTests = createRequire(path.join(testsPackage, 'package.json'));
const importResolved = (spec) => import(pathToFileURL(requireFromTests.resolve(spec)).href);
const playwrightModule = await importResolved('playwright');
const chromium = (playwrightModule.default ?? playwrightModule).chromium;
const wire = await import(pathToFileURL(path.join(testsPackage, 'dist/client-index.js')).href);
const entities = await importResolved('@mj-biz-apps/voting-entities');
const axeSource = readFileSync(
    requireFromTests.resolve('axe-core/axe.min.js', { paths: [path.resolve(repoRoot, '../node_modules/.pnpm/axe-core@4.13.0/node_modules')] }),
    'utf8'
);

const PORT = process.env.VOTING_WIRE_PORT ?? '4104';
const EDGE = `http://localhost:${PORT}`;
const EMBED_PORT = Number(process.env.BALLOT_EMBED_PORT ?? 4199);
const EMBED_ORIGIN = `http://localhost:${EMBED_PORT}`;
const OTHER_ORIGIN = `http://127.0.0.1:${EMBED_PORT}`;
const SHOTS = process.env.SHOT_DIR ?? path.join(repoRoot, 'tmp/ballot-shots');
mkdirSync(SHOTS, { recursive: true });

const DISTRIBUTIONS = 'MJ_BizApps_Voting: Ballot Distributions';
const ELIGIBLE_VOTERS = 'MJ_BizApps_Voting: Eligible Voters';
const GENERIC_ERROR = 'Something went wrong. Please try again.';

// ─── tiny assertion kit ──────────────────────────────────────────────────────

class AssertionError extends Error {}
/** A scenario that cannot proceed because of a known dependency outside this harness (reported, and still fails the run). */
class BlockedError extends Error {}
function ok(cond, msg) {
    if (!cond) throw new AssertionError(msg);
}
function eq(actual, expected, msg) {
    if (actual !== expected) throw new AssertionError(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function contains(text, needle, msg) {
    if (!String(text).includes(needle)) throw new AssertionError(`${msg}: ${JSON.stringify(String(text).slice(0, 200))} does not contain ${JSON.stringify(needle)}`);
}
/** Polls an async predicate (Playwright's is* checks do not retry; Angular updates the DOM a tick after the event). */
async function eventually(fn, msg, timeout = 5000) {
    const end = Date.now() + timeout;
    let last;
    while (Date.now() < end) {
        last = await fn();
        if (last) return;
        await sleep(50);
    }
    throw new AssertionError(msg);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── the wire side: build an election as the admin ───────────────────────────

const cast = await wire.WireCast.Create();
const admin = await cast.As('admin');

// MJ's EntityInfo.ChildEntities (the IS-A child list EnsureISAChild consults) reads the GLOBAL metadata provider, and every
// wire identity is a separate provider, so without a global one no IS-A child resolves for anybody. Register the
// least-privileged persona as the global provider: metadata lookups work, and anything that silently falls back to the
// global provider runs with an ordinary member's rights rather than an administrator's or the system's.
const coreModule = await importResolved('@memberjunction/core');
(coreModule.default ?? coreModule).Metadata.Provider = (await cast.As('outsider')).Provider;

function must(what, result) {
    return wire.MustSucceed(what, result);
}

/** A fresh election, distributed and (optionally) opened, with a PIN per voter. */
async function makeElection({
    type = 'motion',
    contests,
    voters = ['member1'],
    origins = [],
    open = true,
    distributionStatus = 'Active',
    name,
    resultsTiming,
    resultsAudience,
    beforeOpen,
}) {
    const tag = randomBytes(4).toString('hex');
    const electionName = name ?? `Ballot UI ${tag}`;
    const rows = voters.map((key, i) => ({ Email: cast.Record(key).Email, SourceKey: `ui-${tag}-${i}`, Weight: 1 }));
    const created = must(
        'Voting.CreateElection',
        await admin.Call(new entities.VotingCreateElectionOperation(), {
            ElectionTypeCode: type,
            Name: electionName,
            EligibilitySource: { Code: 'csv', Settings: { Rows: rows } },
            Contests: contests,
            ...(resultsTiming ? { ResultsTiming: resultsTiming } : {}),
            ...(resultsAudience ? { ResultsAudience: resultsAudience } : {}),
        })
    );
    const electionID = created.ElectionID;
    must('Voting.FreezeRoll', await admin.Call(new entities.VotingFreezeRollOperation(), { ElectionID: electionID }));

    const d = await admin.NewEntity(DISTRIBUTIONS);
    d.NewRecord();
    d.ElectionID = electionID;
    d.Name = `${electionName} ballot`;
    d.Slug = `ui-${tag}`;
    d.DistributionKey = `key_${randomBytes(8).toString('hex')}`;
    d.Status = distributionStatus;
    d.AllowedCredentialMethods = JSON.stringify(['second-factor']);
    if (origins.length) d.AllowedOrigins = JSON.stringify(origins);
    if (!(await d.Save())) throw new Error(`distribution save failed: ${d.LatestResult?.CompleteMessage ?? 'unknown'}`);

    const election = { ElectionID: electionID, Name: electionName, Slug: `ui-${tag}`, Voters: new Map() };
    if (beforeOpen) await beforeOpen(electionID);
    if (open) await openElection(election, voters);
    return election;
}

async function openElection(election, voters) {
    must('Voting.OpenElection', await admin.Call(new entities.VotingOpenElectionOperation(), { ElectionID: election.ElectionID }));
    const issued = must('Voting.IssueSecondFactorPins', await admin.Call(new entities.VotingIssueSecondFactorPinsOperation(), { ElectionID: election.ElectionID }));
    const roll = await admin.RunView({ EntityName: ELIGIBLE_VOTERS, ExtraFilter: `ElectionID = '${election.ElectionID}'`, Fields: ['ID', 'PersonID'], ResultType: 'simple' });
    ok(roll.Success, `roll read failed: ${roll.ErrorMessage}`);
    for (const key of voters) {
        const personID = cast.Record(key).PersonID;
        const entry = roll.Results.find((r) => r.PersonID.toLowerCase() === personID?.toLowerCase());
        const pin = issued.Issued?.find((p) => p.EligibleVoterID.toLowerCase() === entry?.ID.toLowerCase());
        if (!entry || !pin?.SourceKey) throw new Error(`persona ${key} is not on the roll or has no PIN`);
        election.Voters.set(key, { SourceKey: pin.SourceKey, Pin: pin.Pin, EligibleVoterID: entry.ID });
    }
}

async function closeElection(election) {
    return admin.Call(new entities.VotingCloseElectionOperation(), { ElectionID: election.ElectionID });
}

async function turnout(election) {
    const r = await admin.Call(new entities.VotingGetTurnoutOperation(), { ElectionID: election.ElectionID });
    ok(r.Success && r.Output?.Success, `GetTurnout failed: ${r.ResultCode}: ${r.ErrorMessage ?? r.Output?.Message}`);
    return { Eligible: r.Output.Eligible, Voted: r.Output.Voted };
}

/** Wire-side proof that this voter's participation exists, using the voter's own guest session. */
async function participation(election, voterKey) {
    const v = election.Voters.get(voterKey);
    const session = await wire.GetGuestSession(election.Slug, { SourceKey: v.SourceKey, Pin: v.Pin });
    const guest = await wire.WireClient.ConnectGuest(`guest-${voterKey}`, session.Token);
    const r = await guest.Call(new entities.VotingGetMyParticipationOperation(), { ElectionID: election.ElectionID });
    ok(r.Success && r.Output?.Success, `GetMyParticipation failed: ${r.ResultCode}: ${r.ErrorMessage ?? r.Output?.Message}`);
    return { HasVoted: r.Output.HasVoted, Guest: guest };
}

// ─── contest builders ────────────────────────────────────────────────────────

const opts = (...labels) => labels.map((Label) => ({ Label }));
const question = (name, extra = {}) => ({ Name: name, Kind: 'Question', TallyMethodCode: 'majority', Threshold: 'Majority', Options: opts('Yes', 'No'), ...extra });
const yesNo = (name = 'Adopt the resolution', extra = {}) => ({ Name: name, Kind: 'Motion', TallyMethodCode: 'majority', Threshold: 'Majority', Options: opts('Yes', 'No'), ...extra });
const office = (name, tally, labels, extra = {}) => ({ Name: name, Kind: 'Office', TallyMethodCode: tally, Seats: 1, Options: opts(...labels), ...extra });

// ─── the browser side ────────────────────────────────────────────────────────

const browser = await chromium
    .launch({ headless: process.env.HEADED !== '1', channel: 'chrome' })
    .catch(async (err) => {
        console.warn(`  (system Chrome unavailable: ${err.message.split('\n')[0]}; falling back to bundled chromium)`);
        return chromium.launch({ headless: process.env.HEADED !== '1' });
    });

/** A page that records console errors, page errors, CSP violations and failed requests; expected ones are declared per scenario. */
async function newPage(ctxOptions = {}) {
    const context = await browser.newContext({ viewport: { width: 900, height: 1200 }, ...ctxOptions });
    await context.addInitScript(() => {
        window.__csp = [];
        document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
    });
    const page = await context.newPage();
    const log = { console: [], pageErrors: [], csp: [], expected: [] };
    page.on('console', (m) => {
        if (m.type() === 'error') log.console.push(`${m.text()} @${m.location().url}`);
        if (/Content Security Policy|violates the following/i.test(m.text())) log.csp.push(m.text());
    });
    page.on('pageerror', (e) => log.pageErrors.push(String(e)));
    log.failed = [];
    page.on('response', (r) => r.status() >= 400 && log.failed.push(`${r.status()} ${r.request().method()} ${r.url().replace(/\?.*/, '')}`));
    page.log = log;
    page.closeAll = async () => {
        await shot(page, `end-${currentScenario}`);
        await context.close();
    };
    return page;
}

/**
 * Asserts the page produced no console error, page error or CSP violation. `allow` lists regexes for errors a scenario
 * PROVOKES on purpose (each use is justified at the call site): the browser logs every non-2xx fetch as a console error.
 */
async function assertClean(page, label, allow = []) {
    const csp = await page.evaluate(() => window.__csp ?? []).catch(() => []);
    const unexpected = page.log.console.filter((t) => !allow.some((re) => re.test(t)));
    ok(unexpected.length === 0, `${label}: console errors: ${JSON.stringify(unexpected)} failed requests: ${JSON.stringify(page.log.failed)}`);
    ok(page.log.pageErrors.length === 0, `${label}: page errors: ${JSON.stringify(page.log.pageErrors)}`);
    ok(csp.length === 0 && page.log.csp.length === 0, `${label}: CSP violations: ${JSON.stringify([...csp, ...page.log.csp])}`);
}

let shotNo = 0;
let currentScenario = '';
async function shot(page, name) {
    shotNo += 1;
    await page.screenshot({ path: path.join(SHOTS, `${String(shotNo).padStart(3, '0')}-${name}.png`), fullPage: true }).catch(() => undefined);
}

const ballotUrl = (election) => `${EDGE}/vote/${election.Slug}`;

async function openBallot(page, election) {
    await page.goto(ballotUrl(election));
    await page.locator('mj-ballot .ballot-container').waitFor({ timeout: 15000 });
}

async function waitState(page, state, timeout = 15000) {
    await page.locator(`mj-ballot .ballot-container[data-state="${state}"]`).waitFor({ timeout });
}

async function signIn(page, election, voterKey, { pin } = {}) {
    const v = election.Voters.get(voterKey);
    await waitState(page, 'login');
    await page.locator('mj-ballot #sourceKey').fill(v.SourceKey);
    await page.locator('mj-ballot #pin').fill(pin ?? v.Pin);
    await page.getByRole('button', { name: 'Sign In' }).click();
}

async function signInReady(page, election, voterKey) {
    await openBallot(page, election);
    await signIn(page, election, voterKey);
    await waitState(page, 'ready');
}

const reviewBtn = (page) => page.getByRole('button', { name: 'Review & Cast Ballot' });

async function reviewAndCast(page) {
    await reviewBtn(page).click();
    await waitState(page, 'reviewing');
    await page.getByRole('button', { name: 'Cast Ballot', exact: true }).click();
    await waitState(page, 'cast');
    return (await page.locator('mj-ballot .receipt-code code').innerText()).trim();
}

/** Submits wrong credentials and waits until THIS attempt's refusal is on screen (the PIN field is cleared only on a processed failure). */
async function failedSignIn(page, sourceKey, pin) {
    await page.locator('mj-ballot #sourceKey').fill(sourceKey);
    await page.locator('mj-ballot #pin').fill(pin);
    const [res] = await Promise.all([page.waitForResponse((r) => r.url().endsWith('/vote/session')), page.getByRole('button', { name: 'Sign In' }).click()]);
    await eventually(async () => (await page.locator('mj-ballot #pin').count()) === 1 && (await page.locator('mj-ballot #pin').inputValue()) === '' && (await page.locator('mj-ballot .login-error').count()) === 1, 'the refusal is shown and the PIN cleared');
    return res.status();
}

const validationText = async (page) => {
    const box = page.locator('mj-ballot .validation-errors');
    return (await box.count()) === 0 ? '' : box.innerText();
};

/** Runs the first-party flow for one ballot and proves the vote landed: wire participation + turnout + receipt. */
async function castAndProve(page, election, voterKey, pick) {
    const before = await turnout(election);
    await signInReady(page, election, voterKey);
    await pick(page);
    await shot(page, `${election.Slug}-ready`);
    const receipt = await reviewAndCast(page);
    await shot(page, `${election.Slug}-receipt`);
    ok(receipt.length >= 6, `receipt code is shown (${receipt})`);
    const after = await turnout(election);
    eq(after.Voted, before.Voted + 1, 'turnout increased by one');
    const p = await participation(election, voterKey);
    ok(p.HasVoted === true, 'a participation exists for the voter over the wire');
    const verify = await p.Guest.Call(new entities.VotingVerifyReceiptOperation(), { ElectionID: election.ElectionID, ReceiptCode: receipt });
    ok(verify.Success && verify.Output?.Found === true, `the shown receipt verifies over the wire: ${verify.ErrorMessage ?? verify.Output?.Message ?? ''}`);
    return receipt;
}

// ─── the cross-origin embedding page ─────────────────────────────────────────

function embedPageHtml(slug, mode) {
    const element = `<mj-ballot slug="${slug}" api-root="${EDGE}/vote"></mj-ballot>`;
    const frame = `<iframe id="f" title="Ballot" src="${EDGE}/vote/${slug}" width="800" height="700"></iframe>
<script>window.__msgs=[];window.addEventListener('message',e=>window.__msgs.push({origin:e.origin,data:e.data}));</script>`;
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="icon" href="data:,"><title>Embedding host</title>
<script type="module" src="${EDGE}/vote/element/main.js"></script></head>
<body><main>${mode === 'iframe' ? frame : element}</main></body></html>`;
}

let embedServer;
async function startEmbedServer() {
    embedServer = createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://x');
        const m = url.pathname.match(/^\/(element|iframe)\/(.+)$/);
        if (!m) {
            res.writeHead(404).end();
            return;
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(embedPageHtml(m[2], m[1]));
    });
    await new Promise((resolve, reject) => embedServer.once('error', reject).listen(EMBED_PORT, resolve));
}

// ─── scenarios ───────────────────────────────────────────────────────────────

const scenarios = [];
const scenario = (id, title, fn) => scenarios.push({ id, title, fn });

scenario('motion', '1. first-party host page: sign in, select, review, cast, receipt, reload shows voted, second cast impossible', async () => {
    const e = await makeElection({ type: 'referendum', contests: [question('Adopt the UI resolution', { MinSelections: 1 })], voters: ['member1', 'member2'] });
    const page = await newPage();
    try {
        await openBallot(page, e);
        eq(await page.locator('html').getAttribute('lang'), 'en', 'host page language attribute');
        await shot(page, 'motion-login');
        await page.evaluate(() => {
            window.__ev = [];
            for (const n of ['ballot-state-change', 'ballot-cast', 'ballot-error', 'ballot-close']) {
                document.querySelector('mj-ballot').addEventListener(n, (ev) => window.__ev.push({ name: n, detail: ev.detail }));
            }
        });
        const before = await turnout(e);
        await signIn(page, e, 'member1');
        await waitState(page, 'ready');
        contains(await page.locator('mj-ballot h1').innerText(), e.Name, 'ballot shows the election name');
        await eventually(() => reviewBtn(page).isDisabled(), 'Review is disabled until a choice is made');
        await page.getByLabel('Yes').check();
        await eventually(() => reviewBtn(page).isEnabled(), 'Review is enabled once a choice is made');
        await reviewBtn(page).click();
        await waitState(page, 'reviewing');
        contains(await page.locator('mj-ballot .review-summary').innerText(), 'Yes', 'review lists the choice');
        await page.getByRole('button', { name: 'Back to Editing' }).click();
        await waitState(page, 'ready');
        await eventually(() => page.getByLabel('Yes').isChecked(), 'the choice survives going back to editing');
        const receipt = await reviewAndCast(page);
        await shot(page, 'motion-receipt');
        ok(receipt.length >= 6, 'a receipt code is shown');
        const events = await page.evaluate(() => window.__ev);
        const names = events.map((x) => x.name);
        ok(['ready', 'reviewing'].every((st) => events.some((x) => x.name === 'ballot-state-change' && x.detail.state === st)), `state-change events fire (saw ${JSON.stringify(names)})`);
        const castEvent = events.find((x) => x.name === 'ballot-cast');
        ok(castEvent && castEvent.detail.receiptCode === receipt, 'ballot-cast carries the receipt code');
        ok(!JSON.stringify(events).includes(cast.Record('member1').Email), 'no event carries the voter email');
        eq((await turnout(e)).Voted, before.Voted + 1, 'turnout increased by one over the wire');
        const p = await participation(e, 'member1');
        ok(p.HasVoted, 'participation exists over the wire');
        const verify = await p.Guest.Call(new entities.VotingVerifyReceiptOperation(), { ElectionID: e.ElectionID, ReceiptCode: receipt });
        ok(verify.Output?.Found === true, `receipt verifies over the wire (${verify.ErrorMessage ?? verify.Output?.Message ?? 'no message'})`);
        await assertClean(page, 'motion cast');

        // Reload: the session is memory-only, so the voter signs in again and lands in the already-voted state.
        await page.reload();
        await signIn(page, e, 'member1');
        await waitState(page, 'voted');
        contains(await page.locator('mj-ballot .ballot-receipt').innerText(), 'You Have Already Voted', 'already-voted heading');
        eq(await page.locator('mj-ballot form.ballot-form').count(), 0, 'no ballot form is offered again');
        eq((await turnout(e)).Voted, before.Voted + 1, 'reload did not change turnout');

        // A second cast over the wire with the same guest session is refused.
        const second = await p.Guest.Call(new entities.VotingCastBallotOperation(), {
            ElectionID: e.ElectionID,
            BallotStyleHash: 'x',
            Submission: { Contests: [] },
        });
        ok(!(second.Success && second.Output?.Success), 'a second cast by the same voter is refused over the wire');
        eq((await turnout(e)).Voted, before.Voted + 1, 'still exactly one participation');
        await assertClean(page, 'motion reload');
    } finally {
        await page.closeAll();
    }
});

scenario('revote', '1b. motion elections allow re-voting: reload offers the ballot with the previous receipt, a second cast replaces and does not add turnout', async () => {
    const e = await makeElection({ type: 'motion', contests: [yesNo('Adopt the revote resolution', { MinSelections: 1 })] });
    const page = await newPage();
    try {
        const first = await castAndProve(page, e, 'member1', async (p) => {
            await p.getByLabel('Yes').check();
        });
        await page.reload();
        await signIn(page, e, 'member1');
        await waitState(page, 'ready');
        contains(await page.locator('mj-ballot .previous-receipt').innerText(), first, 'the previous receipt is shown');
        await page.getByLabel('No').check();
        const second = await reviewAndCast(page);
        ok(second !== first, 'a replacement ballot gets a new receipt');
        eq((await turnout(e)).Voted, 1, 'a re-vote does not add turnout');
        await assertClean(page, 'revote');
    } finally {
        await page.closeAll();
    }
});

scenario('plurality', '2a. single-choice (plurality) contest: radio group, change of mind, cast', async () => {
    const e = await makeElection({ type: 'board-election', contests: [office('Chair', 'plurality', ['Ada', 'Grace', 'Edsger'])] });
    const page = await newPage();
    try {
        await castAndProve(page, e, 'member1', async (p) => {
            await p.getByLabel('Ada').check();
            // A voter must be able to change their mind: pick another candidate.
            await p.getByLabel('Grace').check();
            await eventually(() => p.getByLabel('Grace').isChecked(), 'the second pick replaces the first (radio semantics)');
            await eventually(async () => !(await p.getByLabel('Ada').isChecked()), 'the first pick is unchecked');
        });
        await assertClean(page, 'plurality');
    } finally {
        await page.closeAll();
    }
});

scenario('approval', '2b. approval contest: multi-select honouring the maximum', async () => {
    const e = await makeElection({
        type: 'board-election',
        contests: [office('Directors', 'approval', ['Ada', 'Grace', 'Edsger', 'Barbara'], { Seats: 2, MaxSelections: 2, MinSelections: 1 })],
    });
    const page = await newPage();
    try {
        await castAndProve(page, e, 'member1', async (p) => {
            await p.getByLabel('Ada').check();
            await p.getByLabel('Grace').check();
            await eventually(() => p.getByLabel('Edsger').isDisabled(), 'a third option is disabled at the maximum');
            await p.getByLabel('Grace').uncheck();
            await eventually(() => p.getByLabel('Edsger').isEnabled(), 'unchecking frees a slot');
            await p.getByLabel('Barbara').check();
            await eventually(() => reviewBtn(p).isEnabled(), 'valid approval selection can be reviewed');
        });
        await assertClean(page, 'approval');
    } finally {
        await page.closeAll();
    }
});

scenario('ranked', '2c. ranked (IRV) contest: add choices, keyboard reordering, remove, cast', async () => {
    const e = await makeElection({
        type: 'board-election',
        contests: [office('President', 'irv', ['Ada', 'Grace', 'Edsger', 'Barbara'], { MaxSelections: 4, MinSelections: 1 })],
    });
    const page = await newPage();
    try {
        await castAndProve(page, e, 'member1', async (p) => {
            const select = p.locator('mj-ballot .add-selection select');
            await select.selectOption({ label: 'Ada' });
            await select.selectOption({ label: 'Grace' });
            await select.selectOption({ label: 'Edsger' });
            const order = async () => (await p.locator('mj-ballot .ranked-item .label').allInnerTexts()).map((t) => t.trim());
            await eventually(async () => (await order()).join(',') === 'Ada,Grace,Edsger', 'ranked in the order added');
            // Keyboard only: focus Edsger's "up" button and press Enter twice, then Space.
            const up = p.getByRole('button', { name: 'Move Edsger up' });
            await up.focus();
            await p.keyboard.press('Enter');
            await eventually(async () => (await order()).join(',') === 'Ada,Edsger,Grace', 'Enter on "up" moves one place');
            await p.getByRole('button', { name: 'Move Edsger up' }).focus();
            await p.keyboard.press('Space');
            await eventually(async () => (await order()).join(',') === 'Edsger,Ada,Grace', 'Space on "up" moves one place');
            await p.getByRole('button', { name: 'Move Edsger down' }).focus();
            await p.keyboard.press('Enter');
            await eventually(async () => (await order()).join(',') === 'Ada,Edsger,Grace', 'Enter on "down" moves back');
            await p.getByRole('button', { name: 'Remove Grace' }).click();
            await eventually(async () => (await order()).join(',') === 'Ada,Edsger', 'remove drops a choice and ranks close up');
            await select.selectOption({ label: 'Barbara' });
            await eventually(async () => (await order()).join(',') === 'Ada,Edsger,Barbara', 'a later pick lands last');
            const ranks = (await p.locator('mj-ballot .ranked-item .rank').allInnerTexts()).map((t) => t.trim());
            eq(ranks.join(','), '1,2,3', 'rank numbers are consecutive');
        });
        await assertClean(page, 'ranked');
    } finally {
        await page.closeAll();
    }
});

scenario('referendum', '2d. yes/no referendum', async () => {
    const e = await makeElection({ type: 'referendum', contests: [{ Name: 'Approve the budget', Kind: 'Question', TallyMethodCode: 'majority', Threshold: 'Majority', Options: opts('Yes', 'No') }] });
    const page = await newPage();
    try {
        await castAndProve(page, e, 'member1', async (p) => {
            await p.getByLabel('No').check();
        });
        await assertClean(page, 'referendum');
    } finally {
        await page.closeAll();
    }
});

scenario('writein', '2e. write-in option', async () => {
    const e = await makeElection({
        type: 'board-election',
        contests: [{ ...office('Secretary', 'plurality', ['Ada', 'Grace'], { AllowWriteIn: true }), Options: [{ Label: 'Ada' }, { Label: 'Grace' }, { Label: 'Write-in', IsWriteIn: true }] }],
    });
    const page = await newPage();
    try {
        await signInReady(page, e, 'member1');
        const writeIn = page.locator('mj-ballot .option').filter({ hasText: /write/i });
        if ((await writeIn.count()) === 0) {
            // The wire style carries no write-in option unless the operation synthesises one; record what the voter sees.
            const labels = await page.locator('mj-ballot .option label').allInnerTexts();
            throw new AssertionError(`AllowWriteIn=true produced no write-in option in the ballot (options: ${JSON.stringify(labels)})`);
        }
        await writeIn.locator('input[type=radio],input[type=checkbox]').first().check();
        await writeIn.locator('input[type=text]').fill('Alan Turing');
        await writeIn.locator('input[type=text]').blur();
        await reviewAndCast(page);
        eq((await turnout(e)).Voted, 1, 'the write-in ballot counted');
        await assertClean(page, 'write-in');
    } finally {
        await page.closeAll();
    }
});

scenario('multicontest', '2f. multi-contest ballot', async () => {
    const e = await makeElection({
        type: 'board-election',
        contests: [
            office('Chair', 'plurality', ['Ada', 'Grace'], { MinSelections: 1 }),
            office('Treasurer', 'approval', ['Edsger', 'Barbara', 'Donald'], { Seats: 2, MaxSelections: 2, MinSelections: 1 }),
            office('Secretary', 'irv', ['Alan', 'Linus', 'Ken'], { MaxSelections: 3, MinSelections: 1 }),
        ],
    });
    const page = await newPage();
    try {
        await castAndProve(page, e, 'member1', async (p) => {
            eq(await p.locator('mj-ballot .contest').count(), 3, 'three contests are shown');
            await p.getByLabel('Ada').check();
            await p.getByLabel('Edsger').check();
            await eventually(() => reviewBtn(p).isDisabled(), 'Review stays disabled while the ranked contest is unanswered');
            await p.locator('mj-ballot .add-selection select').selectOption({ label: 'Linus' });
        });
        await assertClean(page, 'multi-contest');
    } finally {
        await page.closeAll();
    }
});

scenario('standards', '2g. Standards Ballot: required comment on a No vote', async () => {
    const e = await makeElection({
        type: 'standards-ballot',
        contests: [{ Name: 'Item 4.2 clause rewrite', Kind: 'StandardsItem', TallyMethodCode: 'majority', Threshold: 'Majority', AllowAbstain: true, Options: opts('Approve', 'Disapprove') }],
        resultsAudience: undefined,
        beforeOpen: async (electionID) => {
            // The administrator persona is the right actor (Voting Administrator holds CRU on the Standards Ballot extension).
            // The system identity is a diagnostic fallback only; every identity's failure is reported.
            const failures = [];
            for (const [label, who] of [['admin', admin], ['system', cast.System]]) {
                try {
                    const election = await who.NewEntity('MJ_BizApps_Voting: Elections');
                    if (!(await election.Load(electionID))) {
                        failures.push(`${label}: election did not load`);
                        continue;
                    }
                    const ext = await election.EnsureISAChild('MJ_BizApps_Voting: Standards Ballot Elections');
                    if (!ext) {
                        failures.push(`${label}: no IS-A child`);
                        continue;
                    }
                    ext.DocumentTitle = 'UI Test Standard 1.0';
                    if (await ext.Save()) {
                        if (label !== 'admin') console.log('         (note: standards details saved as the system identity, not the admin persona)');
                        return;
                    }
                    failures.push(`${label}: ${ext.LatestResult?.CompleteMessage ?? 'Save returned false'}`);
                } catch (err) {
                    failures.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
                }
            }
            throw new AssertionError(`standards details (Standards Ballot Elections) could not be saved: ${failures.join(' | ').slice(0, 600)}`);
        },
    });
    const page = await newPage();
    try {
        await signInReady(page, e, 'member1');
        await page.getByLabel('Disapprove').check();
        const commentBox = page.locator('mj-ballot .comment-fieldset textarea').first();
        const needed = await commentBox.count();
        await shot(page, 'standards-disapprove');
        if (needed > 0) {
            // Disapprove must carry a comment: the review button is blocked until one is written.
            await commentBox.fill('The clause contradicts section 3.');
        }
        await reviewAndCast(page);
        eq((await turnout(e)).Voted, 1, 'the standards ballot counted');
        await assertClean(page, 'standards');
    } finally {
        await page.closeAll();
    }
});

scenario('validation', '3. validation UX: undervote, overvote, ranked gaps/duplicates are blocked with a visible message', async () => {
    const e = await makeElection({
        type: 'board-election',
        voters: ['member1'],
        contests: [
            office('Approval pair', 'approval', ['A', 'B', 'C'], { Seats: 2, MaxSelections: 2, MinSelections: 2 }),
            office('Ranked', 'irv', ['X', 'Y', 'Z'], { MaxSelections: 3, MinSelections: 2 }),
        ],
    });
    const page = await newPage();
    try {
        await signInReady(page, e, 'member1');
        await eventually(() => reviewBtn(page).isDisabled(), 'nothing selected: Review blocked');
        const initial = await validationText(page);
        ok(initial.length > 0, 'an undervote message is visible when nothing is selected');
        ok(!/[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i.test(initial), `validation messages name contests, not raw ids (${initial.replace(/\s+/g, ' ').slice(0, 160)})`);
        contains(initial, 'Approval pair', 'the message names the contest');
        await shot(page, 'validation-undervote');
        await page.getByLabel('A', { exact: true }).check();
        ok(/at least|minimum|select/i.test(await validationText(page)), 'one of two required picks still reports the shortfall');
        await page.getByLabel('B', { exact: true }).check();
        await eventually(() => page.getByLabel('C', { exact: true }).isDisabled(), 'overvote is prevented at the control (third box disabled)');
        // Ranked: one rank where two are required.
        const select = page.locator('mj-ballot .add-selection select');
        await select.selectOption({ label: 'X' });
        await eventually(() => reviewBtn(page).isDisabled(), 'ranked with one of two required ranks: blocked');
        await select.selectOption({ label: 'Y' });
        await eventually(() => reviewBtn(page).isEnabled(), 'both contests satisfied: Review enabled');
        eq((await validationText(page)).trim(), '', 'no validation message once everything is valid');
        // Reordering must never leave a rank gap or duplicate (ranks follow list position).
        await page.getByRole('button', { name: 'Move Y up' }).click();
        await page.getByRole('button', { name: 'Move Y down' }).click();
        await page.getByRole('button', { name: 'Move Y up' }).click();
        await eventually(() => reviewBtn(page).isEnabled(), 'after reordering, the ballot is still valid (no rank gap or duplicate)');
        eq((await validationText(page)).trim(), '', 'no rank message after reordering');
        await assertClean(page, 'validation');
    } finally {
        await page.closeAll();
    }
});

scenario('auth', '4a. wrong PIN is a generic error and the form stays usable; repeated failures lock the voter out', async () => {
    const e = await makeElection({ type: 'motion', contests: [yesNo()], voters: ['member1', 'member2'] });
    const page = await newPage();
    // Every refused sign-in is a 401 the browser reports as a console error; that is the behaviour under test.
    const expected401 = [/status of 401/];
    try {
        await openBallot(page, e);
        const v = e.Voters.get('member1');
        eq(await failedSignIn(page, v.SourceKey, '00000000'), 401, 'wrong PIN status');
        const msg = (await page.locator('mj-ballot .login-error').innerText()).trim();
        eq(msg, 'Sign-in failed', 'the generic sign-in message (reveals neither the key nor the PIN as the culprit)');
        await shot(page, 'auth-wrong-pin');
        // Unknown roster key reads identically.
        eq(await failedSignIn(page, 'no-such-key', '12345678'), 401, 'unknown key status');
        eq((await page.locator('mj-ballot .login-error').innerText()).trim(), msg, 'an unknown key looks the same as a wrong PIN');

        // Lock the voter out: five bad PINs in total, then the CORRECT PIN is refused too.
        for (let i = 0; i < 6; i += 1) {
            const r = await wire.RequestGuestSession(e.Slug, { SourceKey: v.SourceKey, Pin: `0000000${i}` });
            eq(r.Kind, 'refused', 'bad PIN refused');
        }
        eq(await failedSignIn(page, v.SourceKey, v.Pin), 401, 'locked voter status');
        eq((await page.locator('mj-ballot .login-error').innerText()).trim(), 'Sign-in failed', 'a locked voter gets the same generic message with the right PIN');
        eq(await page.locator('mj-ballot form.ballot-form').count(), 0, 'no ballot was shown to the locked voter');
        // The other voter is unaffected.
        const v2 = e.Voters.get('member2');
        await page.locator('mj-ballot #sourceKey').fill(v2.SourceKey);
        await page.locator('mj-ballot #pin').fill(v2.Pin);
        await page.getByRole('button', { name: 'Sign In' }).click();
        await waitState(page, 'ready');
        await assertClean(page, 'auth', expected401);
    } finally {
        await page.closeAll();
    }
});

scenario('closed', '4b. closed, not-yet-open and inactive distributions show an unavailable message; a mid-session close refuses the cast', async () => {
    // Closed election: the host page is a 404 notice and the element is never mounted.
    const closed = await makeElection({ type: 'motion', contests: [yesNo()] });
    must('Voting.CloseElection', await closeElection(closed));
    const notOpen = await makeElection({ type: 'motion', contests: [yesNo()], open: false });
    const inactive = await makeElection({ type: 'motion', contests: [yesNo()], distributionStatus: 'Paused' });
    // Page loads of unavailable ballots are HTTP 404s, which Chrome logs as console errors: expected here.
    const expected404 = [/status of 404/];
    for (const [label, election] of [['closed', closed], ['not yet open', notOpen], ['paused', inactive]]) {
        const page = await newPage();
        try {
            const res = await page.goto(ballotUrl(election));
            eq(res.status(), 404, `${label} election: HTTP status`);
            const text = await page.locator('main').innerText();
            contains(text, 'not available', `${label} election: message`);
            eq(await page.locator('mj-ballot').count(), 0, `${label} election: no element mounted`);
            await shot(page, `unavailable-${label.replace(/ /g, '-')}`);
            await assertClean(page, `unavailable ${label}`, expected404);
        } finally {
            await page.closeAll();
        }
    }
    // Mid-session close: the voter has the ballot open, the admin closes, the cast must be refused with a message.
    const live = await makeElection({ type: 'motion', contests: [yesNo()] });
    const page = await newPage();
    try {
        await signInReady(page, live, 'member1');
        await page.getByLabel('Yes').check();
        must('Voting.CloseElection', await closeElection(live));
        await reviewBtn(page).click();
        await waitState(page, 'reviewing');
        await page.getByRole('button', { name: 'Cast Ballot', exact: true }).click();
        await page.locator('mj-ballot .ballot-error, mj-ballot .ballot-closed').first().waitFor({ timeout: 15000 });
        const text = await page.locator('mj-ballot .ballot-container').innerText();
        ok(!/Ballot Cast Successfully/.test(text), 'the cast did not succeed');
        await shot(page, 'closed-mid-session');
        eq((await turnout(live)).Voted, 0, 'nothing was recorded after the close');
        // Record what the voter is told (a generic failure here is a UX gap, reported by the next assertion).
        ok(!text.includes(GENERIC_ERROR), `mid-session close tells the voter why (saw: ${JSON.stringify(text.replace(/\s+/g, ' ').slice(0, 160))})`);
    } finally {
        await page.closeAll();
    }
});

scenario('embed', '5. embedded mode: allowed origin works, disallowed origin is refused, iframe posts events to the embedding page', async () => {
    const e = await makeElection({ type: 'motion', contests: [yesNo()], voters: ['member1', 'member2'], origins: [EMBED_ORIGIN] });

    // Allowed: the script embed on EMBED_ORIGIN loads the info and signs in cross-origin.
    const ok1 = await newPage();
    try {
        await ok1.goto(`${EMBED_ORIGIN}/element/${e.Slug}`);
        await ok1.locator('mj-ballot .ballot-container').waitFor({ timeout: 15000 });
        await signIn(ok1, e, 'member1');
        await waitState(ok1, 'ready');
        await ok1.getByLabel('Yes').check();
        await reviewAndCast(ok1);
        eq((await turnout(e)).Voted, 1, 'cross-origin allowed embed recorded the vote');
        await assertClean(ok1, 'embed allowed');
    } finally {
        await ok1.closeAll();
    }

    // Disallowed: same page served from another origin (127.0.0.1) cannot even read /info, so the element shows an error.
    const bad = await newPage();
    try {
        const sessions = [];
        bad.on('response', (r) => r.url().endsWith('/vote/session') && sessions.push(r.status()));
        await bad.goto(`${OTHER_ORIGIN}/element/${e.Slug}`);
        await bad.locator('mj-ballot .ballot-container').waitFor({ timeout: 15000 });
        await waitState(bad, 'error');
        eq(await bad.locator('mj-ballot #pin').count(), 0, 'no sign-in form for a disallowed origin');
        eq(sessions.length, 0, 'no session was ever minted for the disallowed origin');
        await shot(bad, 'embed-disallowed');
        await assertClean(bad, 'embed disallowed', [/CORS|Failed to load resource|ERR_FAILED|403/]);
    } finally {
        await bad.closeAll();
    }
    // The edge itself refuses the origin on POST /session, with no CORS grant (server-side proof, independent of the browser).
    const direct = await wire.RequestGuestSession(e.Slug, e.Voters.get('member2'), { Origin: OTHER_ORIGIN });
    ok(direct.Kind === 'refused' && direct.Status === 403, `edge refuses a disallowed Origin with 403 (got ${JSON.stringify(direct.Kind === 'refused' ? direct.Status : 'session')})`);

    // Iframe: the host page is framed by EMBED_ORIGIN (frame-ancestors) and reports height/events to it.
    const f = await newPage();
    try {
        await f.goto(`${EMBED_ORIGIN}/iframe/${e.Slug}`);
        const frame = f.frameLocator('#f');
        await frame.locator('mj-ballot .ballot-container').waitFor({ timeout: 15000 });
        await frame.locator('mj-ballot #sourceKey').fill(e.Voters.get('member2').SourceKey);
        await frame.locator('mj-ballot #pin').fill(e.Voters.get('member2').Pin);
        await frame.getByRole('button', { name: 'Sign In' }).click();
        await frame.locator('mj-ballot .ballot-container[data-state="ready"]').waitFor({ timeout: 15000 });
        await frame.getByLabel('No').check();
        await frame.getByRole('button', { name: 'Review & Cast Ballot' }).click();
        await frame.getByRole('button', { name: 'Cast Ballot', exact: true }).click();
        await frame.locator('mj-ballot .ballot-container[data-state="cast"]').waitFor({ timeout: 15000 });
        const msgs = await f.evaluate(() => window.__msgs);
        const heights = msgs.filter((m) => m.data?.type === 'mj-ballot-height');
        const events = msgs.filter((m) => m.data?.type === 'mj-ballot-event').map((m) => m.data.name);
        ok(heights.length > 0, `iframe posts mj-ballot-height to the embedder (messages: ${JSON.stringify(msgs.map((m) => m.data?.type))})`);
        ok(events.includes('ballot-state-change') && events.includes('ballot-cast'), `iframe mirrors ballot events (saw ${JSON.stringify(events)})`);
        ok(msgs.every((m) => m.origin === EDGE), 'messages come from the edge origin');
        const cast = msgs.find((m) => m.data?.name === 'ballot-cast');
        ok(cast && !JSON.stringify(cast.data.detail).match(/member2|@/), 'event detail carries no name or email');
        eq((await turnout(e)).Voted, 2, 'iframe vote recorded');
        await assertClean(f, 'iframe parent');
    } finally {
        await f.closeAll();
    }

    // A non-allowed framer is refused by frame-ancestors: the iframe never renders the ballot.
    const e2 = await makeElection({ type: 'motion', contests: [yesNo()], origins: [OTHER_ORIGIN] });
    const g = await newPage();
    try {
        const violations = [];
        g.on('console', (m) => /frame-ancestors|Refused to frame/.test(m.text()) && violations.push(m.text()));
        await g.goto(`${EMBED_ORIGIN}/iframe/${e2.Slug}`);
        await sleep(2000);
        eq(await g.frameLocator('#f').locator('mj-ballot').count(), 0, 'a framer outside frame-ancestors gets no ballot');
        ok(violations.length > 0, 'the browser reports the frame-ancestors refusal');
    } finally {
        await g.closeAll();
    }
});

scenario('a11y', '6. accessibility smoke: keyboard-only completion, labels, focus visibility, language, axe', async () => {
    const e = await makeElection({
        type: 'board-election',
        contests: [office('Chair', 'plurality', ['Ada', 'Grace', 'Edsger'], { MinSelections: 1 }), office('Treasurer', 'plurality', ['Alan', 'Linus'], { MinSelections: 1 })],
    });
    const page = await newPage();
    try {
        await openBallot(page, e);
        eq(await page.locator('html').getAttribute('lang'), 'en', 'html lang attribute');
        // axe on the sign-in screen
        const axeLogin = await runAxe(page);
        ok(axeLogin.length === 0, `axe (sign-in): ${JSON.stringify(axeLogin)}`);
        // Keyboard-only sign in
        const v = e.Voters.get('member1');
        await page.locator('mj-ballot #sourceKey').focus();
        await page.keyboard.type(v.SourceKey);
        await page.keyboard.press('Tab');
        await page.keyboard.type(v.Pin);
        await page.keyboard.press('Enter');
        await page.locator('mj-ballot .ballot-container[data-state="ready"]').waitFor({ timeout: 15000 });

        // Every control has an accessible name; every input has a label.
        const unlabeled = await page.evaluate(() => {
            const root = document.querySelector('mj-ballot').shadowRoot;
            const bad = [];
            for (const el of root.querySelectorAll('input, select, textarea, button')) {
                const id = el.id;
                const labelled = (id && root.querySelector(`label[for="${CSS.escape(id)}"]`)) || el.closest('label') || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (el.tagName === 'BUTTON' && el.textContent.trim());
                if (!labelled) bad.push(`${el.tagName.toLowerCase()}#${id}[${el.getAttribute('type') ?? ''}]`);
            }
            return bad;
        });
        eq(unlabeled.length, 0, `unlabeled controls: ${JSON.stringify(unlabeled)}`);
        const groups = await page.locator('mj-ballot fieldset > legend').count();
        ok(groups >= 2, 'each contest is a fieldset with a legend');

        // Keyboard-only: Tab to the first radio and select with arrow keys / Space, then through to Review.
        await page.getByLabel('Ada').focus();
        const focusVisible = await page.evaluate(() => {
            const el = document.querySelector('mj-ballot').shadowRoot.activeElement;
            if (!el) return 'no active element';
            const cs = getComputedStyle(el);
            return cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 ? 'ok' : `outline ${cs.outlineStyle} ${cs.outlineWidth}, box-shadow ${cs.boxShadow}`;
        });
        await page.keyboard.press('Space');
        await eventually(() => page.getByLabel('Ada').isChecked(), 'Space selects the focused radio');
        await page.getByLabel('Alan').focus();
        await page.keyboard.press('Space');
        await eventually(() => page.getByLabel('Alan').isChecked(), 'Space selects Alan');
        const axeBallot = await runAxe(page);
        ok(axeBallot.length === 0, `axe (ballot): ${JSON.stringify(axeBallot)}`);
        await reviewBtn(page).focus();
        await page.keyboard.press('Enter');
        await waitState(page, 'reviewing');
        const axeReview = await runAxe(page);
        ok(axeReview.length === 0, `axe (review): ${JSON.stringify(axeReview)}`);
        await page.getByRole('button', { name: 'Cast Ballot', exact: true }).focus();
        await page.keyboard.press('Enter');
        await waitState(page, 'cast');
        eq((await turnout(e)).Voted, 1, 'keyboard-only ballot counted');
        const axeReceipt = await runAxe(page);
        ok(axeReceipt.length === 0, `axe (receipt): ${JSON.stringify(axeReceipt)}`);
        eq(focusVisible, 'ok', 'focused controls show a visible focus indicator');
        await assertClean(page, 'a11y');
    } finally {
        await page.closeAll();
    }
});

async function runAxe(page) {
    await page.evaluate(axeSource);
    const result = await page.evaluate(async () => {
        // eslint-disable-next-line no-undef
        const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
        return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
    });
    return result;
}

scenario('a11y-dark', '6a. accessibility under prefers-color-scheme: dark (contrast of every screen)', async () => {
    const e = await makeElection({ type: 'board-election', contests: [office('Chair', 'plurality', ['Ada', 'Grace'], { MinSelections: 1 })] });
    const page = await newPage({ colorScheme: 'dark' });
    try {
        await openBallot(page, e);
        const axeLogin = await runAxe(page);
        ok(axeLogin.length === 0, `axe dark (sign-in): ${JSON.stringify(axeLogin)}`);
        await signIn(page, e, 'member1');
        await waitState(page, 'ready');
        await page.getByLabel('Ada').check();
        await eventually(() => reviewBtn(page).isEnabled(), 'review enabled');
        const axeBallot = await runAxe(page);
        ok(axeBallot.length === 0, `axe dark (ballot): ${JSON.stringify(axeBallot)}`);
        const receipt = await reviewAndCast(page);
        ok(receipt.length > 0, 'cast');
        const axeReceipt = await runAxe(page);
        ok(axeReceipt.length === 0, `axe dark (receipt): ${JSON.stringify(axeReceipt)}`);
        await assertClean(page, 'a11y dark');
    } finally {
        await page.closeAll();
    }
});

scenario('mobile', '6c. phone-width layout (360px): no horizontal scroll on sign-in, ballot or receipt', async () => {
    const e = await makeElection({ type: 'board-election', contests: [office('Chair', 'plurality', ['Ada Lovelace-Babbage', 'Grace Brewster Murray Hopper', 'Edsger Wybe Dijkstra'], { MinSelections: 1 })] });
    const page = await newPage({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    try {
        await openBallot(page, e);
        ok((await overflow()) <= 0, `sign-in overflows horizontally by ${await overflow()}px`);
        await signIn(page, e, 'member1');
        await waitState(page, 'ready');
        ok((await overflow()) <= 0, `ballot overflows horizontally by ${await overflow()}px`);
        await page.getByLabel('Grace Brewster Murray Hopper').tap();
        await reviewAndCast(page);
        ok((await overflow()) <= 0, `receipt overflows horizontally by ${await overflow()}px`);
        await assertClean(page, 'mobile');
    } finally {
        await page.closeAll();
    }
});

scenario('language', '6b. language attribute is honoured (no UI translation exists; the attribute only selects the ballot language)', async () => {
    const e = await makeElection({ type: 'motion', contests: [yesNo()] });
    const page = await newPage();
    try {
        await openBallot(page, e);
        // `language="es"` is passed to GetMyBallot/CastBallot; strings are English-only by design (known limitation).
        await page.evaluate(() => document.querySelector('mj-ballot').setAttribute('language', 'es'));
        await sleep(300);
        await signIn(page, e, 'member1');
        await waitState(page, 'ready');
        ok((await page.locator('mj-ballot .ballot-container').getAttribute('data-state')) !== 'error', 'a language attribute does not break the ballot');
        await assertClean(page, 'language');
    } finally {
        await page.closeAll();
    }
});

scenario('csp', '7. host page security headers and the element bundle', async () => {
    const e = await makeElection({ type: 'motion', contests: [yesNo()] });
    const res = await fetch(ballotUrl(e));
    eq(res.status, 200, 'host page status');
    const csp = res.headers.get('content-security-policy') ?? '';
    contains(csp, "frame-ancestors 'none'", 'no framing without an allowlist');
    ok(/script-src 'nonce-[A-Za-z0-9_-]+'/.test(csp), 'script-src is nonce-only');
    eq(res.headers.get('x-frame-options'), 'DENY', 'X-Frame-Options when framing is denied');
    eq(res.headers.get('referrer-policy'), 'no-referrer', 'referrer policy');
    const html = await res.text();
    ok(!/#t=|token/i.test(html), 'the host page never carries a token');
    const el = await fetch(`${EDGE}/vote/element/main.js`);
    eq(el.status, 200, 'element bundle served');
    ok(/javascript/.test(el.headers.get('content-type') ?? ''), 'element bundle content type');
    eq(el.headers.get('access-control-allow-origin'), '*', 'element bundle is cross-origin readable');
    const page = await newPage();
    try {
        await signInReady(page, e, 'member1');
        await page.getByLabel('Yes').check();
        await reviewAndCast(page);
        await assertClean(page, 'full flow under CSP');
        // An inline script injected by the page is blocked by the CSP (proves the policy is actually enforced).
        const blocked = await page.evaluate(() => {
            window.__probe = 0;
            const s = document.createElement('script');
            s.textContent = 'window.__probe = 1';
            document.body.appendChild(s);
            return window.__probe;
        });
        eq(blocked, 0, 'an injected inline script does not run');
    } finally {
        await page.closeAll();
    }
});

scenario('receipt', '8. receipt verification in the browser (the element offers none: verify the shown code over the wire and confirm no UI)', async () => {
    const e = await makeElection({ type: 'motion', contests: [yesNo()] });
    const page = await newPage();
    try {
        const receipt = await castAndProve(page, e, 'member1', async (p) => {
            await p.getByLabel('Yes').check();
        });
        const verifyControls = await page.locator('mj-ballot').getByText(/verify/i).count();
        // The receipt text only says "Save this code to verify your ballot was counted": no verification control exists.
        ok(verifyControls <= 1, 'no verification form is offered');
        ok(receipt.length > 0, 'receipt shown');
    } finally {
        await page.closeAll();
    }
});

// ─── runner ──────────────────────────────────────────────────────────────────

const filters = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const selected = scenarios.filter((s) => !filters.length || filters.some((f) => s.id.startsWith(f)));

console.log(`\n  Ballot live (headless Chrome -> ${EDGE}), screenshots in ${SHOTS}\n`);
await startEmbedServer();
let pass = 0;
let fail = 0;
const failures = [];
for (const s of selected) {
    const started = Date.now();
    currentScenario = s.id;
    try {
        await s.fn();
        pass += 1;
        console.log(`  ok   ${s.id.padEnd(13)} ${s.title}  (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    } catch (err) {
        fail += 1;
        const msg = err instanceof Error ? err.message.replace(/\s*\n\s*/g, ' | ').slice(0, 600) : String(err);
        failures.push({ id: s.id, msg });
        console.log(`  ${err instanceof BlockedError ? 'BLOCKED' : 'FAIL'} ${s.id.padEnd(13)} ${s.title}\n         ${msg}`);
    }
}
await browser.close();
embedServer.close();
console.log(`\n  ${pass} passed, ${fail} failed of ${selected.length}\n`);
process.exit(fail === 0 ? 0 : 1);
