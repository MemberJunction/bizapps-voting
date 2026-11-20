/**
 * wire-volume: concurrency at scale, through the public edge. COMMITS DATA (tagged `vol-<hex>` in e-mails and slugs).
 *
 *   WIRE_VOL_COUNT  voters in the main election (default 200)
 *   WIRE_VOL_PAR    sessions in flight at once (default 25)
 *   WIRE_VOL_RACE   voters in the double-cast election (default 60)
 *
 * The edge allows 20 sign-ins per minute per slug by default. Run the host with `VOTING_WIRE_RATE_MAX=100000` (see
 * test-harnesses/README.md) or the bundle spends its time honouring Retry-After.
 *
 *   V01  the roll holds exactly N voters, N PINs were issued, nobody has voted
 *   V02  N voters sign in through /vote/session and cast concurrently: every cast succeeds, receipts are unique, no 5xx
 *   V03  exactly one participation per voter; ballots == participations; running tallies == ballots; turnout == N
 *   V04  double-cast races (same session twice, four-way, and two sessions of the same voter): exactly one ballot per voter
 *   V05  after close and tally the totals equal what was cast, per option
 *   V06  storage order and id order of the ballots do not follow completion order
 *   V07  no deadlock/timeout in the host log, latency percentiles within sanity bounds (printed)
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { Assert, AssertEqual, IntegrationCheckRegistry, type IntegrationCheckContext, type NamedCheck } from '@memberjunction/testing-integration/registry';
import {
    VotingCloseElectionOperation,
    VotingGetResultsOperation,
    VotingGetTurnoutOperation,
    VotingTallyOperation,
    type VotingBallotStyle,
    type VotingGetMyBallotOutput,
    type VotingCastBallotOutput,
} from '@mj-biz-apps/voting-entities';
import { PostSessionRaw, RawRemoteOp, RawRunView, type RawCredential } from '../wire/raw-graphql.js';
import { BuildWorldElection, CloseWorldElection, CreatePeople, Describe, MapLimit, Sleep, SubmissionFor, type PersonRef, type WorldElection, type WorldVoter } from '../wire/vote-world.js';
import { WireCast } from '../wire/wire-cast.js';
import type { WireClient } from '../wire/wire-client.js';

const BUNDLE = 'wire-volume';
const P = 'MJ_BizApps_Voting: ';
const N = Math.max(10, Number(process.env.WIRE_VOL_COUNT ?? 200));
const PAR = Math.max(1, Number(process.env.WIRE_VOL_PAR ?? 25));
const RACE = Math.max(8, Number(process.env.WIRE_VOL_RACE ?? 60));

interface CastTrace {
    Index: number;
    SignInMs: number;
    BallotMs: number;
    CastMs: number;
    DoneAt: number;
    Success: boolean;
    Receipt?: string;
    Error?: string;
    Option: number;
}

interface VolumeWorld {
    Cast: WireCast;
    Admin: WireClient;
    Tag: string;
    People: PersonRef[];
    Main: WorldElection;
    Traces: CastTrace[];
    LogPath: string;
    LogStart: number;
}

let world: VolumeWorld | undefined;
function W(): VolumeWorld {
    if (!world) throw new Error('wire-volume setup did not run');
    return world;
}

const SYSTEM: RawCredential = { Kind: 'system' };

function Percentile(xs: number[], p: number): number {
    if (xs.length === 0) return 0;
    const sorted = [...xs].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function Stats(label: string, xs: number[]): string {
    return `${label}: n=${xs.length} p50=${Percentile(xs, 50)}ms p95=${Percentile(xs, 95)}ms p99=${Percentile(xs, 99)}ms max=${Math.max(0, ...xs)}ms`;
}

async function Rows(entity: string, fields: string[], filter: string, max = 5000): Promise<Array<Record<string, unknown>>> {
    const info = W().Cast.System.Provider.Entities.find((e) => e.Name === P + entity);
    if (!info) throw new Error(`entity ${entity} missing`);
    const r = await RawRunView(SYSTEM, info.ClassName, P + entity, fields, { ExtraFilter: filter, MaxRows: max });
    if (!r.Ran) throw new Error(`system read of ${entity} failed: ${r.Message}`);
    return r.Rows;
}

/** Signs in through the public edge, honouring the rate limiter's Retry-After. */
async function SignIn(slug: string, voter: WorldVoter): Promise<{ Token: string; Ms: number; Waited: number }> {
    let waited = 0;
    const started = Date.now();
    for (let attempt = 0; attempt < 30; attempt++) {
        const res = await PostSessionRaw(JSON.stringify({ Slug: slug, MethodCode: 'second-factor', Credential: { SourceKey: voter.SourceKey, Pin: voter.Pin } }));
        if (res.Status === 200 && typeof res.Json?.Token === 'string') return { Token: res.Json.Token, Ms: Date.now() - started - waited, Waited: waited };
        if (res.Status === 429) {
            const wait = Math.max(1, Number(res.Headers.get('retry-after') ?? 5)) * 1000;
            waited += wait;
            await Sleep(wait);
            continue;
        }
        throw new Error(`sign-in answered ${res.Status}: ${res.Text.slice(0, 100)}`);
    }
    throw new Error('sign-in kept being rate limited');
}

async function GetBallot(token: string, electionID: string): Promise<{ Style?: VotingBallotStyle; Ms: number; Error?: string }> {
    const t = Date.now();
    const r = await RawRemoteOp<VotingGetMyBallotOutput>({ Kind: 'bearer', Token: token }, 'Voting.GetMyBallot', { ElectionID: electionID });
    const ms = Date.now() - t;
    if (!r.Success || !r.Output?.Success || !r.Output.Style) return { Ms: ms, Error: `GetMyBallot ${r.ResultCode}/${r.Status}: ${r.ErrorMessage ?? r.Output?.Message ?? 'no style'}` };
    return { Style: r.Output.Style, Ms: ms };
}

async function CastRaw(token: string, electionID: string, style: VotingBallotStyle, option: number): Promise<{ Ok: boolean; Receipt?: string; Ms: number; Message?: string; Code: string; Status: number }> {
    const t = Date.now();
    const r = await RawRemoteOp<VotingCastBallotOutput>({ Kind: 'bearer', Token: token }, 'Voting.CastBallot', { ElectionID: electionID, BallotStyleHash: style.Hash, Submission: SubmissionFor(style, option) });
    return { Ok: r.Success && r.Output?.Success === true, Receipt: r.Output?.ReceiptCode, Ms: Date.now() - t, Message: r.ErrorMessage ?? r.Output?.Message, Code: r.ResultCode, Status: r.Status };
}

function Spearman(order: number[]): number {
    // order[i] = rank of the i-th stored row in completion order; correlation with 0..n-1
    const n = order.length;
    const ranks = (xs: number[]): number[] => {
        const idx = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
        const out = new Array<number>(n);
        idx.forEach(([, i], pos) => (out[i] = pos));
        return out;
    };
    const a = ranks(order);
    const d2 = a.reduce((s, v, i) => s + (v - i) ** 2, 0);
    return 1 - (6 * d2) / (n * (n * n - 1));
}

function Fail(list: string[]): void {
    Assert(list.length === 0, `${list.length} problem(s):\n         - ${list.slice(0, 25).join('\n         - ')}${list.length > 25 ? `\n         - ... ${list.length - 25} more` : ''}`);
}

const checks: NamedCheck[] = [
    {
        Id: `${BUNDLE}.V01`,
        Name: `V01 - the roll holds exactly ${N} voters, ${N} PINs were issued, nobody has voted`,
        Fn: async () => {
            const w = W();
            AssertEqual(w.Main.Voters.size, N, 'voters with PINs');
            const roll = await Rows('Eligible Voters', ['ID', 'Status'], `ElectionID = '${w.Main.ElectionID}'`);
            AssertEqual(roll.length, N, 'roll size');
            const pins = new Set([...w.Main.Voters.values()].map((v) => v.SourceKey));
            AssertEqual(pins.size, N, 'distinct roster keys');
            const turnout = await w.Admin.Call(new VotingGetTurnoutOperation(), { ElectionID: w.Main.ElectionID });
            Assert(turnout.Success && turnout.Output?.Success === true, `turnout failed: ${Describe(turnout)}`);
            AssertEqual(turnout.Output?.Eligible, N, 'eligible');
            AssertEqual(turnout.Output?.Voted, 0, 'voted');
        },
    },
    {
        Id: `${BUNDLE}.V02`,
        Name: `V02 - ${N} voters sign in at the edge and cast concurrently (${PAR} in flight): all succeed, receipts unique, no 5xx`,
        Fn: async () => {
            const w = W();
            const voters = w.People.map((p) => w.Main.Voters.get(p.Label) as WorldVoter);
            const wall = Date.now();
            w.Traces = await MapLimit(voters, PAR, async (voter, index): Promise<CastTrace> => {
                const option = index % 2;
                const trace: CastTrace = { Index: index, SignInMs: 0, BallotMs: 0, CastMs: 0, DoneAt: 0, Success: false, Option: option };
                try {
                    const s = await SignIn(w.Main.Slug, voter);
                    trace.SignInMs = s.Ms;
                    const b = await GetBallot(s.Token, w.Main.ElectionID);
                    trace.BallotMs = b.Ms;
                    if (!b.Style) {
                        trace.Error = b.Error;
                        return trace;
                    }
                    const c = await CastRaw(s.Token, w.Main.ElectionID, b.Style, option);
                    trace.CastMs = c.Ms;
                    trace.DoneAt = Date.now();
                    trace.Success = c.Ok;
                    trace.Receipt = c.Receipt;
                    if (!c.Ok) trace.Error = `cast ${c.Code}/${c.Status}: ${c.Message}`;
                } catch (e) {
                    trace.Error = e instanceof Error ? e.message : String(e);
                }
                return trace;
            });
            const elapsed = Date.now() - wall;
            const failures = w.Traces.filter((t) => !t.Success);
            console.log(`         ${N} voters in ${elapsed}ms (${(N / (elapsed / 1000)).toFixed(1)} voters/s); ${Stats('sign-in', w.Traces.map((t) => t.SignInMs))}; ${Stats('get-ballot', w.Traces.map((t) => t.BallotMs))}; ${Stats('cast', w.Traces.map((t) => t.CastMs))}`);
            const problems = failures.slice(0, 20).map((t) => `voter ${t.Index}: ${t.Error}`);
            const receipts = w.Traces.filter((t) => t.Receipt).map((t) => t.Receipt);
            if (new Set(receipts).size !== receipts.length) problems.push('duplicate receipt codes');
            if (failures.length > 0) problems.unshift(`${failures.length} of ${N} voters failed`);
            Fail(problems);
        },
    },
    {
        Id: `${BUNDLE}.V03`,
        Name: 'V03 - one participation per voter, ballots == participations, running tallies == ballots, turnout == N',
        Fn: async () => {
            const w = W();
            const problems: string[] = [];
            const parts = await Rows('Participations', ['ID', 'EligibleVoterID'], `ElectionID = '${w.Main.ElectionID}'`);
            const distinct = new Set(parts.map((p) => String(p.EligibleVoterID).toLowerCase()));
            if (parts.length !== N) problems.push(`${parts.length} participations, expected ${N}`);
            if (distinct.size !== parts.length) problems.push(`${parts.length - distinct.size} duplicate participations (a voter counted twice)`);
            const ballots = await Rows('Cast Ballots', ['ID', 'ReceiptCode', 'Status'], `ElectionID = '${w.Main.ElectionID}'`);
            if (ballots.length !== parts.length) problems.push(`ballots (${ballots.length}) != participations (${parts.length})`);
            const live = ballots.filter((b) => String(b.Status) !== 'Superseded');
            if (live.length !== N) problems.push(`${live.length} live ballots, expected ${N}`);
            const contests = await Rows('Contests', ['ID'], `ElectionID = '${w.Main.ElectionID}'`);
            const tallies = await Rows('Contest Running Tallies', ['ID', 'ContestID', 'VoteCount'], `ContestID IN ('${contests.map((c) => c.ID).join("','")}')`);
            const tallied = tallies.reduce((s, t) => s + Number(t.VoteCount), 0);
            if (tallies.length > 0 && tallied !== N * contests.length) problems.push(`running tallies sum to ${tallied}, expected ${N * contests.length}`);
            const turnout = await w.Admin.Call(new VotingGetTurnoutOperation(), { ElectionID: w.Main.ElectionID });
            if (turnout.Output?.Voted !== N) problems.push(`GetTurnout says ${turnout.Output?.Voted} voted, expected ${N}`);
            Fail(problems);
        },
    },
    {
        Id: `${BUNDLE}.V04`,
        Name: `V04 - double-cast races over ${RACE} voters (same session twice, four-way, two sessions): exactly one ballot per voter`,
        Fn: async () => {
            const w = W();
            const people = await CreatePeople(w.Cast.System, `${w.Tag}-race`, RACE);
            const race = await BuildWorldElection(w.Cast, w.Admin, { Voters: people, SecrecyMode: 'Secret', ResultsTiming: 'Live', ResultsAudience: 'Eligible', SlugPrefix: `${w.Tag}-race` });
            const problems: string[] = [];
            const outcomes = await MapLimit(people, Math.min(PAR, 15), async (p, i) => {
                const voter = race.Voters.get(p.Label) as WorldVoter;
                const s1 = await SignIn(race.Slug, voter);
                const b = await GetBallot(s1.Token, race.ElectionID);
                if (!b.Style) return { Index: i, Errors: [`ballot: ${b.Error}`], Successes: 0, Attempts: 0, ServerErrors: [] as string[] };
                const style = b.Style;
                // Three shapes of race, spread across the voters.
                const mode = i % 3;
                const attempts: Array<Promise<Awaited<ReturnType<typeof CastRaw>>>> = [];
                if (mode === 0) {
                    attempts.push(CastRaw(s1.Token, race.ElectionID, style, 0), CastRaw(s1.Token, race.ElectionID, style, 1));
                } else if (mode === 1) {
                    for (let k = 0; k < 4; k++) attempts.push(CastRaw(s1.Token, race.ElectionID, style, k % 2));
                } else {
                    const s2 = await SignIn(race.Slug, voter);
                    attempts.push(CastRaw(s1.Token, race.ElectionID, style, 0), CastRaw(s2.Token, race.ElectionID, style, 1));
                }
                const results = await Promise.all(attempts);
                const successes = results.filter((r) => r.Ok).length;
                const serverErrors = results.filter((r) => r.Status >= 500 || /deadlock|timeout|timed out|ECONNRESET|EXECUTION_ERROR/i.test(`${r.Code} ${r.Message ?? ''}`)).map((r) => `${r.Code}/${r.Status}: ${r.Message}`);
                return { Index: i, Errors: [] as string[], Successes: successes, Attempts: results.length, ServerErrors: serverErrors };
            });
            for (const o of outcomes) {
                for (const e of o.Errors) problems.push(`voter ${o.Index}: ${e}`);
                if (o.Errors.length === 0 && o.Successes !== 1) problems.push(`voter ${o.Index} (${o.Attempts} concurrent casts): ${o.Successes} succeeded, expected exactly 1`);
                for (const e of o.ServerErrors) problems.push(`voter ${o.Index}: server error ${e}`);
            }
            const parts = await Rows('Participations', ['ID', 'EligibleVoterID'], `ElectionID = '${race.ElectionID}'`);
            const distinct = new Set(parts.map((p) => String(p.EligibleVoterID).toLowerCase()));
            if (parts.length !== RACE || distinct.size !== RACE) problems.push(`participations ${parts.length} (distinct ${distinct.size}), expected ${RACE}`);
            const ballots = await Rows('Cast Ballots', ['ID'], `ElectionID = '${race.ElectionID}'`);
            if (ballots.length !== RACE) problems.push(`${ballots.length} ballots for ${RACE} voters (a raced voter left a second ballot)`);
            const contests = await Rows('Contests', ['ID'], `ElectionID = '${race.ElectionID}'`);
            const tallies = await Rows('Contest Running Tallies', ['VoteCount'], `ContestID IN ('${contests.map((c) => c.ID).join("','")}')`);
            const tallied = tallies.reduce((s, t) => s + Number(t.VoteCount), 0);
            if (tallies.length > 0 && tallied !== RACE) problems.push(`running tallies sum to ${tallied}, expected ${RACE}`);
            await CloseWorldElection(w.Admin, race);
            Fail(problems);
        },
    },
    {
        Id: `${BUNDLE}.V05`,
        Name: 'V05 - after close and tally the totals equal what was cast, per option',
        Fn: async () => {
            const w = W();
            let closed = await w.Admin.Call(new VotingCloseElectionOperation(), { ElectionID: w.Main.ElectionID });
            if (!closed.Success || closed.Output?.Success !== true) closed = await w.Cast.System.Call(new VotingCloseElectionOperation(), { ElectionID: w.Main.ElectionID });
            Assert(closed.Success && closed.Output?.Success === true, `close failed: ${Describe(closed)}`);
            let tally = await w.Admin.Call(new VotingTallyOperation(), { ElectionID: w.Main.ElectionID });
            if (!tally.Success || tally.Output?.Success !== true) tally = await w.Cast.System.Call(new VotingTallyOperation(), { ElectionID: w.Main.ElectionID });
            Assert(tally.Success && tally.Output?.Success === true, `tally failed: ${Describe(tally)}`);
            const expectedYes = w.Traces.filter((t) => t.Success && t.Option === 0).length;
            const expectedNo = w.Traces.filter((t) => t.Success && t.Option === 1).length;
            const contest = tally.Output?.Contests?.[0];
            Assert(!!contest, 'a contest result');
            AssertEqual(contest!.VotesCast, N, 'VotesCast');
            const votes = contest!.Options.map((o) => o.Votes).sort((a, b) => b - a);
            AssertEqual(votes.join(','), [expectedYes, expectedNo].sort((a, b) => b - a).join(','), 'per-option votes');
            const selections = await Rows('Ballot Selections', ['ID'], `ContestID = '${contest!.ContestID}'`);
            AssertEqual(selections.length, N, 'BallotSelection rows after the tally');
            const results = await w.Admin.Call(new VotingGetResultsOperation(), { ElectionID: w.Main.ElectionID });
            Assert(results.Output?.Visible === true, `final results not visible to the administrator: ${Describe(results)}`);
            AssertEqual(results.Output?.Contests?.[0]?.VotesCast, N, 'GetResults VotesCast');
        },
    },
    {
        Id: `${BUNDLE}.V06`,
        Name: 'V06 - the ballots\' storage order and id order do not follow completion order (rank correlation is weak)',
        Fn: async () => {
            const w = W();
            const byReceipt = new Map(w.Traces.filter((t) => t.Receipt).map((t) => [t.Receipt as string, t.DoneAt] as const));
            // Storage order = the order a view returns with no ORDER BY (clustered key order).
            const ballots = await Rows('Cast Ballots', ['ID', 'ReceiptCode'], `ElectionID = '${w.Main.ElectionID}'`);
            const stored = ballots.map((b) => byReceipt.get(String(b.ReceiptCode)) ?? 0);
            const rhoStorage = Spearman(stored);
            const sortedById = [...ballots].sort((a, b) => String(a.ID).localeCompare(String(b.ID)));
            const rhoId = Spearman(sortedById.map((b) => byReceipt.get(String(b.ReceiptCode)) ?? 0));
            console.log(`         rank correlation with completion time: storage order rho=${rhoStorage.toFixed(3)}, id order rho=${rhoId.toFixed(3)} (n=${ballots.length}; random expectation 0 +/- ${(1 / Math.sqrt(ballots.length - 1)).toFixed(3)})`);
            Assert(Math.abs(rhoStorage) < 0.3, `storage order of CastBallot correlates with completion order (rho=${rhoStorage.toFixed(3)})`);
            Assert(Math.abs(rhoId) < 0.3, `id order of CastBallot correlates with completion order (rho=${rhoId.toFixed(3)})`);
        },
    },
    {
        Id: `${BUNDLE}.V07`,
        Name: 'V07 - no deadlock or timeout in the host log during the run; latency within sanity bounds',
        Fn: async () => {
            const w = W();
            const problems: string[] = [];
            if (existsSync(w.LogPath)) {
                const text = readFileSync(w.LogPath, 'utf8').slice(w.LogStart);
                const bad = text.split('\n').filter((l) => /deadlock|Timeout: Request failed|ETIMEDOUT|ECONNRESET|chosen as the deadlock victim|1205/i.test(l));
                if (bad.length > 0) problems.push(`${bad.length} suspicious host log line(s), e.g. ${bad[0].slice(0, 160)}`);
            } else {
                console.log(`         (host log not found at ${w.LogPath}; set VOTING_WIRE_RUN_DIR to scan it)`);
            }
            const cast = w.Traces.map((t) => t.CastMs);
            const signIn = w.Traces.map((t) => t.SignInMs);
            if (Percentile(cast, 95) > 10_000) problems.push(`cast p95 ${Percentile(cast, 95)}ms exceeds 10s`);
            if (Percentile(signIn, 95) > 10_000) problems.push(`sign-in p95 ${Percentile(signIn, 95)}ms exceeds 10s`);
            if (Math.max(0, ...cast) > 30_000) problems.push(`slowest cast ${Math.max(...cast)}ms exceeds 30s`);
            Fail(problems);
        },
    },
];

for (const check of checks) IntegrationCheckRegistry.Instance.Register(check);

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (_ctx: IntegrationCheckContext) => {
        const cast = await WireCast.Create();
        const admin = await cast.As('admin');
        const tag = `vol-${randomBytes(3).toString('hex')}`;
        const here = dirname(fileURLToPath(import.meta.url));
        const runDir = process.env.VOTING_WIRE_RUN_DIR ?? resolve(here, '../../../../tmp');
        const logPath = resolve(runDir, 'voting-wire-host.log');
        const logStart = existsSync(logPath) ? statSync(logPath).size : 0;
        const people = await CreatePeople(cast.System, tag, N);
        const main = await BuildWorldElection(cast, admin, { Voters: people, SecrecyMode: 'Secret', ResultsTiming: 'Live', ResultsAudience: 'Eligible', SlugPrefix: tag });
        world = { Cast: cast, Admin: admin, Tag: tag, People: people, Main: main, Traces: [], LogPath: logPath, LogStart: logStart };
    },
    Teardown: async (_ctx: IntegrationCheckContext) => {
        if (world) await CloseWorldElection(world.Admin, world.Main);
        world = undefined;
    },
});
