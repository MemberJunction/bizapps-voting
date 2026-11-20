/**
 * wire-secrecy: try to link a ballot to a voter, from every identity, by every door the wire offers.
 *
 *   X01  the ballot-box tables carry no time and no voter reference, keep no change history, have no delete API
 *   X02  nobody but the engine reads the ballot box: four doors (per-entity view, generic view, single record, ad-hoc SQL)
 *        x admin, inspector, member, outsider, trustee, a voter's own guest session
 *   X03  selections are ciphertext at rest; ids are random; receipts are random and hold no identity
 *   X04  attribution exists exactly for Open/Confidential elections; Secret leaves no link and cannot revote
 *   X05  no value in the roll, credentials, poll book or audit trail also occurs in the ballot box (cross-table intersection)
 *   X06  audit-trail events carry no ballot content (receipts, ballot ids, option ids, credentials)
 *   X07  receipts verify for any voter, never reveal whose, are election-bound and tamper-evident
 *   X08  nothing observable moves per cast: running results stay hidden, other identities cannot read turnout
 *   X09  after the tally, GetResults is aggregate-only, audience-gated, and exposes no per-voter field or value
 *   X10  the order the ballots were cast in is not recoverable from ids or storage order
 *   X11  the minimum-cast threshold (k) withholds RUNNING results below k ballots; the final result of record is not withheld
 *        (documented: docs/voting/known-limitations.md, "ResultsMinCast guards running results only")
 *   X12  credential secrets are unreadable to non-administrators
 *   X13  what a member CAN read of a frozen election row: the eligibility source settings are reduced to a marker and a
 *        digest (no emails, no selection criteria), Configuration holds documented keys only; an undeclared key is refused
 *
 * Six generated people vote in each of three elections (Secret, Confidential, Open) in a known order, one per second.
 */
import { randomBytes } from 'node:crypto';
import { Assert, AssertEqual, IntegrationCheckRegistry, type IntegrationCheckContext, type NamedCheck } from '@memberjunction/testing-integration/registry';
import {
    ELECTION_CONFIGURATION_KEYS,
    VotingCastBallotOperation,
    VotingCloseElectionOperation,
    VotingCreateElectionOperation,
    VotingGetMyBallotOperation,
    VotingGetResultsOperation,
    VotingGetTurnoutOperation,
    VotingTallyOperation,
    VotingVerifyReceiptOperation,
} from '@mj-biz-apps/voting-entities';
import { RawAdhocSql, RawGenericRunView, RawGetRecord, RawRunView, type RawCredential } from '../wire/raw-graphql.js';
import {
    BuildWorldElection,
    CastWith,
    CloseWorldElection,
    CreatePeople,
    Describe,
    GuestFor,
    Sleep,
    SubmissionFor,
    type PersonRef,
    type WorldElection,
} from '../wire/vote-world.js';
import { RequirePersona } from '../wire/persona-store.js';
import { GetGuestSession } from '../wire/guest-session.js';
import { WireCast } from '../wire/wire-cast.js';
import type { WireClient } from '../wire/wire-client.js';

const BUNDLE = 'wire-secrecy';
const P = 'MJ_BizApps_Voting: ';

interface CastRecord {
    VoterIndex: number;
    Label: string;
    Option: number;
    Receipt: string;
    CastOrder: number;
    ClientAt: number;
}

interface SecrecyElection {
    Mode: 'Secret' | 'Confidential' | 'Open';
    E: WorldElection;
    Casts: CastRecord[];
}

interface SecrecyWorld {
    Cast: WireCast;
    Admin: WireClient;
    People: PersonRef[];
    S: SecrecyElection;
    C: SecrecyElection;
    O: SecrecyElection;
    /** Guests by election slug then voter label. */
    Guests: Map<string, WireClient>;
    GuestToken: string;
}

let world: SecrecyWorld | undefined;
function W(): SecrecyWorld {
    if (!world) throw new Error('wire-secrecy setup did not run');
    return world;
}

const CAST_ORDER = [3, 0, 5, 1, 4, 2];
const BALLOT_BOX = ['Cast Ballots', 'Ballot Selections', 'Contest Running Tallies', 'Ballot Attributions'] as const;

function Info(entityName: string) {
    const info = W().Cast.System.Provider.Entities.find((e) => e.Name === P + entityName);
    if (!info) throw new Error(`entity ${entityName} not in metadata`);
    return info;
}

function FieldsOf(entityName: string): string[] {
    return Info(entityName).Fields.map((f) => f.Name);
}

const SYSTEM: RawCredential = { Kind: 'system' };

function PersonaCred(key: 'admin' | 'inspector' | 'member1' | 'outsider' | 'trustee1'): RawCredential {
    return { Kind: 'user-key', Key: RequirePersona(key).APIKey };
}

async function SystemRows(entityName: string, filter = '', max = 200): Promise<Array<Record<string, unknown>>> {
    const r = await RawRunView(SYSTEM, Info(entityName).ClassName, P + entityName, FieldsOf(entityName), { ExtraFilter: filter, MaxRows: max });
    if (!r.Ran) throw new Error(`system could not read ${entityName}: ${r.Message}`);
    return r.Rows;
}

async function AsAdminRows(entityName: string, electionID: string): Promise<Array<Record<string, unknown>>> {
    const cred = PersonaCred('admin');
    const info = Info(entityName);
    const hasElection = info.Fields.some((f) => f.Name === 'ElectionID');
    const r = await RawRunView(cred, info.ClassName, P + entityName, FieldsOf(entityName), { ExtraFilter: hasElection ? `ElectionID = '${electionID}'` : '', MaxRows: 500 });
    // The admin is allowed to read these; if the permission model denies it, fall back to the system so content checks still run.
    return r.Ran ? r.Rows : SystemRows(entityName, hasElection ? `ElectionID = '${electionID}'` : '', 500);
}

function StringsOf(value: unknown, out: Set<string> = new Set<string>()): Set<string> {
    if (typeof value === 'string') out.add(value);
    else if (Array.isArray(value)) for (const v of value) StringsOf(v, out);
    else if (value && typeof value === 'object') for (const v of Object.values(value)) StringsOf(v, out);
    return out;
}

const RECEIPT = /^[A-Z0-9]{4}(-[A-Z0-9]{4}){4}$/;
const GUID = /^[0-9A-F]{8}-[0-9A-F]{4}-([0-9A-F])[0-9A-F]{3}-([0-9A-F])[0-9A-F]{3}-[0-9A-F]{12}$/i;

async function CastAll(mode: SecrecyElection['Mode'], people: PersonRef[], cast: WireCast, admin: WireClient, guests: Map<string, WireClient>): Promise<SecrecyElection> {
    const e = await BuildWorldElection(cast, admin, { Voters: people, SecrecyMode: mode, ResultsTiming: 'AfterClose', ResultsAudience: 'Eligible', SlugPrefix: `wire-s${mode[0].toLowerCase()}` });
    const casts: CastRecord[] = [];
    for (let n = 0; n < CAST_ORDER.length; n++) {
        const idx = CAST_ORDER[n];
        const label = people[idx].Label;
        const g = await GuestFor(e, label);
        guests.set(`${e.Slug}/${label}`, g);
        const at = Date.now();
        const out = await CastWith(g, e.ElectionID, idx % 2);
        if (!out.Success || !out.ReceiptCode) throw new Error(`${mode} cast #${n} (voter ${idx}) failed: ${out.Message}`);
        casts.push({ VoterIndex: idx, Label: label, Option: idx % 2, Receipt: out.ReceiptCode, CastOrder: n, ClientAt: at });
        await Sleep(1100);
    }
    return { Mode: mode, E: e, Casts: casts };
}

/** Spearman rank correlation of two equal-length numeric sequences (ties broken by position). */
function Spearman(a: number[], b: number[]): number {
    const rank = (xs: number[]): number[] => {
        const order = xs.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]);
        const r: number[] = new Array<number>(xs.length);
        order.forEach(([, i], pos) => (r[i] = pos));
        return r;
    };
    const ra = rank(a);
    const rb = rank(b);
    const n = a.length;
    const d2 = ra.reduce((s, v, i) => s + (v - rb[i]) ** 2, 0);
    return 1 - (6 * d2) / (n * (n * n - 1));
}

async function CloseAndTally(election: WorldElection): Promise<string | null> {
    const w = W();
    let closed = await w.Admin.Call(new VotingCloseElectionOperation(), { ElectionID: election.ElectionID });
    if (!closed.Success || closed.Output?.Success !== true) closed = await w.Cast.System.Call(new VotingCloseElectionOperation(), { ElectionID: election.ElectionID });
    if (!closed.Success || closed.Output?.Success !== true) return `close failed: ${Describe(closed)}`;
    let tallied = await w.Admin.Call(new VotingTallyOperation(), { ElectionID: election.ElectionID });
    if (!tallied.Success || tallied.Output?.Success !== true) tallied = await w.Cast.System.Call(new VotingTallyOperation(), { ElectionID: election.ElectionID });
    return tallied.Success && tallied.Output?.Success === true ? null : `tally failed: ${Describe(tallied)}`;
}

let tallied = false;
async function EnsureTallied(): Promise<void> {
    if (tallied) return;
    const w = W();
    for (const e of [w.S, w.C, w.O]) {
        const err = await CloseAndTally(e.E);
        if (err) throw new Error(`${e.Mode}: ${err}`);
    }
    tallied = true;
}

const checks: NamedCheck[] = [
    {
        Id: `${BUNDLE}.X01`,
        Name: 'X01 - ballot-box schema: no time, no voter reference, no change history, no delete API',
        Fn: async () => {
            const problems: string[] = [];
            const timeLike = /(^__mj_|CreatedAt|UpdatedAt|CastAt|OccurredAt|Timestamp|At$)/;
            for (const name of ['Cast Ballots', 'Ballot Selections', 'Contest Running Tallies']) {
                const info = Info(name);
                for (const f of info.Fields) if (timeLike.test(f.Name)) problems.push(`${name} has the time-like column ${f.Name}`);
                for (const f of info.Fields) {
                    const rel = f.RelatedEntity ?? '';
                    if (/Eligible Voters|People|Users|Participations|Credentials/.test(rel)) problems.push(`${name}.${f.Name} references ${rel}`);
                }
                if (info.TrackRecordChanges) problems.push(`${name} keeps Record Changes (each change would carry a timestamp)`);
            }
            for (const name of BALLOT_BOX) {
                if (Info(name).AllowDeleteAPI) problems.push(`${name} exposes a delete API`);
            }
            // Record Changes must hold nothing about the three timestamp-free tables.
            const ids = ['Cast Ballots', 'Ballot Selections', 'Contest Running Tallies'].map((n) => `'${Info(n).ID}'`).join(',');
            const rc = await W().Cast.System.RunView<{ ID: string }>({ EntityName: 'MJ: Record Changes', ExtraFilter: `EntityID IN (${ids})`, Fields: ['ID'], ResultType: 'simple', MaxRows: 5 });
            if (rc.Success && rc.Results.length > 0) problems.push(`Record Changes holds ${rc.Results.length}+ rows about the ballot box`);
            Assert(problems.length === 0, problems.join('\n         - '));
        },
    },
    {
        Id: `${BUNDLE}.X02`,
        Name: 'X02 - only the engine reads the ballot box: 4 doors x 6 identities (control: the system sees the rows)',
        Fn: async () => {
            const w = W();
            const leaks: string[] = [];
            // Control: the rows exist and the system reaches them, so an empty answer for anyone else means something.
            const control = await SystemRows('Cast Ballots', `ElectionID = '${w.S.E.ElectionID}'`);
            AssertEqual(control.length, 6, 'the system sees the six Secret ballots');
            const ballotIDs = new Map<string, string>();
            for (const name of BALLOT_BOX) {
                const rows = await SystemRows(name, name === 'Cast Ballots' ? `ElectionID = '${w.S.E.ElectionID}'` : '', 1).catch(() => []);
                if (rows[0]) ballotIDs.set(name, String(rows[0].ID));
            }
            const guestSession = w.GuestToken;
            const identities: Array<[string, RawCredential]> = [
                ['admin', PersonaCred('admin')],
                ['inspector', PersonaCred('inspector')],
                ['member', PersonaCred('member1')],
                ['outsider', PersonaCred('outsider')],
                ['trustee', PersonaCred('trustee1')],
                ['guest', { Kind: 'bearer', Token: guestSession }],
            ];
            for (const [who, cred] of identities) {
                for (const name of BALLOT_BOX) {
                    const info = Info(name);
                    const full = P + name;
                    const door1 = await RawRunView(cred, info.ClassName, full, ['ID'], { MaxRows: 3 });
                    if (door1.Ran) leaks.push(`${who} read ${name} through the per-entity view (${door1.Rows.length} rows)`);
                    const door2 = await RawGenericRunView(cred, full, { MaxRows: 3 });
                    if (door2.Ran) leaks.push(`${who} read ${name} through the generic RunDynamicView (${door2.Rows.length} rows)`);
                    const id = ballotIDs.get(name);
                    if (id) {
                        const door3 = await RawGetRecord(cred, info.ClassName, id, ['ID']);
                        if (door3.Ran) leaks.push(`${who} fetched a ${name} record by id`);
                    }
                    const door4 = await RawAdhocSql(cred, `SELECT TOP 3 ID FROM [${info.SchemaName}].[${info.BaseTable}]`);
                    if (door4.Ran) leaks.push(`${who} read ${name} through ExecuteAdhocQuery (${door4.Rows.length} rows)`);
                }
            }
            Assert(leaks.length === 0, `${leaks.length} door(s) open:\n         - ${leaks.join('\n         - ')}`);
        },
    },
    {
        Id: `${BUNDLE}.X03`,
        Name: 'X03 - selections are ciphertext at rest, ids are random, receipts are random and carry no identity',
        Fn: async () => {
            const w = W();
            const problems: string[] = [];
            const rows = await SystemRows('Cast Ballots', `ElectionID = '${w.S.E.ElectionID}'`);
            const optionIDs = new Set<string>();
            const contests = await SystemRows('Contest Options', `ContestID IN (SELECT ID FROM [${Info('Contests').SchemaName}].[${Info('Contests').BaseView}] WHERE ElectionID = '${w.S.E.ElectionID}')`);
            for (const o of contests) optionIDs.add(String(o.ID).toLowerCase());
            for (const r of rows) {
                const sel = String(r.Selections ?? '');
                if (!sel.startsWith('v1:')) problems.push(`ballot ${r.ID}: Selections is not a v1: ciphertext (starts "${sel.slice(0, 12)}")`);
                for (const id of optionIDs) if (sel.toLowerCase().includes(id)) problems.push(`ballot ${r.ID}: Selections contains the plaintext option id ${id}`);
                const m = GUID.exec(String(r.ID));
                if (!m || m[1] !== '4' || !/[89ab]/i.test(m[2])) problems.push(`ballot id ${r.ID} is not a random (version 4) GUID; sequential ids would reveal order`);
                if (!RECEIPT.test(String(r.ReceiptCode))) problems.push(`receipt "${r.ReceiptCode}" has an unexpected format`);
            }
            // The receipt carries no voter identity.
            for (const c of w.S.Casts) {
                const voter = w.S.E.Voters.get(c.Label);
                if (!voter) continue;
                const compact = c.Receipt.replace(/-/g, '').toLowerCase();
                const identity = [voter.SourceKey, voter.Email.split('@')[0], voter.EligibleVoterID.replace(/-/g, ''), voter.PersonID.replace(/-/g, '')].map((s) => s.toLowerCase());
                for (const token of identity) if (token.length >= 6 && compact.includes(token.slice(0, 6))) problems.push(`receipt ${c.Receipt} contains an identity fragment (${token.slice(0, 6)})`);
            }
            AssertEqual(new Set(w.S.Casts.map((c) => c.Receipt)).size, 6, 'six distinct receipts');
            Assert(problems.length === 0, problems.join('\n         - '));
        },
    },
    {
        Id: `${BUNDLE}.X04`,
        Name: 'X04 - attribution exists exactly for Open/Confidential; Secret leaves no link and refuses a revote; receipts by mode',
        Fn: async () => {
            const w = W();
            const problems: string[] = [];
            for (const e of [w.S, w.C, w.O]) {
                const ballots = await SystemRows('Cast Ballots', `ElectionID = '${e.E.ElectionID}'`);
                const ids = ballots.map((b) => `'${b.ID}'`).join(',');
                const attrs = await SystemRows('Ballot Attributions', `CastBallotID IN (${ids})`);
                const expected = e.Mode === 'Secret' ? 0 : 6;
                if (attrs.length !== expected) problems.push(`${e.Mode}: ${attrs.length} attribution rows, expected ${expected}`);
                // A voter's own view of their receipt afterwards.
                const voter = e.Casts[0];
                const g = w.Guests.get(`${e.E.Slug}/${voter.Label}`) as WireClient;
                const ballot = await g.Call(new VotingGetMyBallotOperation(), { ElectionID: e.E.ElectionID });
                const shown = ballot.Output?.ReceiptCode ?? null;
                if (e.Mode === 'Secret' && shown) problems.push(`Secret: GetMyBallot re-displays a receipt (${shown}); the server should hold no voter-to-ballot link`);
                if (e.Mode !== 'Secret' && shown !== voter.Receipt) problems.push(`${e.Mode}: GetMyBallot shows "${shown}", expected the cast receipt`);
                if (ballot.Output?.HasVoted !== true) problems.push(`${e.Mode}: HasVoted is not true after voting`);
                // A second cast: Secret never allows a revote.
                if (e.Mode === 'Secret') {
                    const again = await g.Call(new VotingCastBallotOperation(), { ElectionID: e.E.ElectionID, BallotStyleHash: ballot.Output?.Style?.Hash ?? 'x', Submission: ballot.Output?.Style ? SubmissionFor(ballot.Output.Style, 1) : { Contests: [] } });
                    if (again.Output?.Success === true) problems.push('Secret: a second CastBallot was accepted');
                }
            }
            const secretBallots = await SystemRows('Cast Ballots', `ElectionID = '${w.S.E.ElectionID}'`);
            AssertEqual(secretBallots.length, 6, 'a refused revote must not add a Secret ballot');
            Assert(problems.length === 0, problems.join('\n         - '));
        },
    },
    {
        Id: `${BUNDLE}.X05`,
        Name: 'X05 - no identifier of the roll, credentials, poll book or audit trail also occurs in the ballot box (Secret and Confidential)',
        Fn: async () => {
            const w = W();
            const problems: string[] = [];
            for (const e of [w.S, w.C]) {
                const ballots = await SystemRows('Cast Ballots', `ElectionID = '${e.E.ElectionID}'`);
                const ballotKeys = new Set<string>();
                for (const b of ballots) {
                    ballotKeys.add(String(b.ID).toLowerCase());
                    ballotKeys.add(String(b.ReceiptCode).toLowerCase());
                }
                const identityTables = ['Eligible Voters', 'Participations', 'Election Audit Events'];
                for (const t of identityTables) {
                    for (const row of await AsAdminRows(t, e.E.ElectionID)) {
                        for (const s of StringsOf(row)) {
                            const lower = s.toLowerCase();
                            if (ballotKeys.has(lower)) problems.push(`${e.Mode}: ${t} row holds a ballot key (${lower.slice(0, 13)}...)`);
                            for (const k of ballotKeys) if (k.length >= 20 && lower.includes(k)) problems.push(`${e.Mode}: ${t} row embeds a ballot key`);
                        }
                    }
                }
                // Columns: nothing in the poll book points at the box and nothing in the box points at the poll book.
                const part = FieldsOf('Participations');
                if (part.some((f) => /Ballot|Receipt|Selection/i.test(f))) problems.push(`Participations has a ballot-pointing column: ${part.filter((f) => /Ballot|Receipt|Selection/i.test(f)).join(',')}`);
                const box = FieldsOf('Cast Ballots').concat(FieldsOf('Ballot Selections'));
                if (box.some((f) => /Voter|Person|Participation|User/i.test(f))) problems.push(`ballot box has a voter-pointing column: ${box.filter((f) => /Voter|Person|Participation|User/i.test(f)).join(',')}`);
            }
            Assert(problems.length === 0, [...new Set(problems)].join('\n         - '));
        },
    },
    {
        Id: `${BUNDLE}.X06`,
        Name: 'X06 - audit-trail events carry no ballot content (receipts, ballot ids, option ids, credentials)',
        Fn: async () => {
            const w = W();
            const problems: string[] = [];
            for (const e of [w.S, w.C]) {
                const events = await AsAdminRows('Election Audit Events', e.E.ElectionID);
                const castEvents = events.filter((ev) => /cast|vote|ballot/i.test(String(ev.EventType)));
                const forbidden: string[] = [];
                for (const c of e.Casts) forbidden.push(c.Receipt.toLowerCase());
                for (const b of await SystemRows('Cast Ballots', `ElectionID = '${e.E.ElectionID}'`)) forbidden.push(String(b.ID).toLowerCase());
                for (const o of await SystemRows('Contest Options', `ContestID IN (SELECT ID FROM [${Info('Contests').SchemaName}].[${Info('Contests').BaseView}] WHERE ElectionID = '${e.E.ElectionID}')`)) forbidden.push(String(o.ID).toLowerCase());
                for (const v of e.E.Voters.values()) forbidden.push(v.Pin.toLowerCase());
                for (const ev of events) {
                    const blob = JSON.stringify(ev).toLowerCase();
                    for (const f of forbidden) if (f.length >= 4 && blob.includes(f)) problems.push(`${e.Mode}: audit event ${ev.EventType} contains a ballot-content/credential value (${f.slice(0, 8)}...)`);
                    if (/selection|choice|option/i.test(String(ev.Details ?? '')) && /cast|vote/i.test(String(ev.EventType))) problems.push(`${e.Mode}: cast-event details mention selections: ${String(ev.Details).slice(0, 80)}`);
                }
                Assert(castEvents.length === 0 || castEvents.length <= 6, `${e.Mode}: more cast events (${castEvents.length}) than ballots`);
            }
            Assert(problems.length === 0, [...new Set(problems)].join('\n         - '));
        },
    },
    {
        Id: `${BUNDLE}.X07`,
        Name: 'X07 - receipts: verifiable by any voter, unlinked to the voter, election-bound, tamper-evident, minimal response',
        Fn: async () => {
            const w = W();
            const problems: string[] = [];
            const a = w.S.Casts[0];
            const b = w.S.Casts[1];
            const gB = w.Guests.get(`${w.S.E.Slug}/${b.Label}`) as WireClient;
            const own = await gB.Call(new VotingVerifyReceiptOperation(), { ElectionID: w.S.E.ElectionID, ReceiptCode: b.Receipt });
            if (!(own.Output?.Found === true && own.Output?.Counted === true)) problems.push(`own receipt not verified: ${Describe(own)}`);
            const others = await gB.Call(new VotingVerifyReceiptOperation(), { ElectionID: w.S.E.ElectionID, ReceiptCode: a.Receipt });
            if (!(others.Output?.Found === true)) problems.push('a receipt is not verifiable by another voter (it is a public proof of inclusion)');
            const keys = Object.keys(others.Output ?? {}).sort().join(',');
            if (keys !== 'Counted,Found,Success') problems.push(`VerifyReceipt output has unexpected members: ${keys}`);
            const wrongElection = await gB.Call(new VotingVerifyReceiptOperation(), { ElectionID: w.C.E.ElectionID, ReceiptCode: a.Receipt });
            if (wrongElection.Success && wrongElection.Output?.Found === true) problems.push('a Secret-election receipt verified against a different election');
            const flipped = a.Receipt.slice(0, -1) + (a.Receipt.endsWith('A') ? 'B' : 'A');
            const tamper = await gB.Call(new VotingVerifyReceiptOperation(), { ElectionID: w.S.E.ElectionID, ReceiptCode: flipped });
            if (tamper.Output?.Found === true) problems.push('a receipt with one character changed still verified');
            const lower = await gB.Call(new VotingVerifyReceiptOperation(), { ElectionID: w.S.E.ElectionID, ReceiptCode: `${a.Receipt} OR 1=1 --` });
            if (lower.Output?.Found === true) problems.push('a receipt with an injected suffix verified');
            // The outsider (no Person) learns only existence.
            const outsider = await (await w.Cast.As('outsider')).Call(new VotingVerifyReceiptOperation(), { ElectionID: w.S.E.ElectionID, ReceiptCode: a.Receipt });
            if (outsider.Output && Object.keys(outsider.Output).some((k) => !['Success', 'Message', 'Found', 'Counted'].includes(k))) problems.push('outsider VerifyReceipt output has extra members');
            // Receipts are not ordered like the casts.
            const byCast = [...w.S.Casts].sort((x, y) => x.CastOrder - y.CastOrder).map((c) => c.Receipt);
            const sorted = [...byCast].sort();
            if (JSON.stringify(sorted) === JSON.stringify(byCast) || JSON.stringify(sorted.reverse()) === JSON.stringify(byCast)) problems.push('receipt codes sort exactly like the cast order');
            Assert(problems.length === 0, problems.join('\n         - '));
        },
    },
    {
        Id: `${BUNDLE}.X08`,
        Name: 'X08 - nothing observable moves per cast: running results stay hidden (AfterClose), turnout is not readable by voters',
        Fn: async () => {
            const w = W();
            const problems: string[] = [];
            // A fresh Open election whose votes are cast one at a time while a voter and an outsider poll.
            const e = await BuildWorldElection(w.Cast, w.Admin, { Voters: w.People, SecrecyMode: 'Secret', ResultsTiming: 'AfterClose', ResultsAudience: 'Eligible', SlugPrefix: 'wire-sw' });
            const voterClient = await GuestFor(e, w.People[0].Label);
            const outsider = await w.Cast.As('outsider');
            const seen = new Set<string>();
            for (let i = 0; i < 4; i++) {
                const c = await GuestFor(e, w.People[i + 1].Label);
                const out = await CastWith(c, e.ElectionID, i % 2);
                if (!out.Success) problems.push(`cast ${i} failed: ${out.Message}`);
                for (const [who, client] of [['voter', voterClient], ['outsider', outsider], ['admin', w.Admin]] as const) {
                    const r = await client.Call(new VotingGetResultsOperation(), { ElectionID: e.ElectionID });
                    if (r.Output?.Visible === true) problems.push(`${who} sees results while voting is open (after cast ${i + 1})`);
                    seen.add(`${who}:${JSON.stringify(r.Output)}`);
                }
                const turnout = await voterClient.Call(new VotingGetTurnoutOperation(), { ElectionID: e.ElectionID });
                if (turnout.Success) problems.push('a voter may call GetTurnout');
            }
            // Same answer every time for each identity (three identities, so three distinct strings at most).
            if (seen.size > 3) problems.push(`GetResults answers changed between casts (${seen.size} distinct answers for 3 identities)`);
            await CloseWorldElection(w.Admin, e);
            Assert(problems.length === 0, problems.join('\n         - '));
        },
    },
    {
        Id: `${BUNDLE}.X09`,
        Name: 'X09 - after the tally GetResults is aggregate-only, audience-gated, and exposes no per-voter field or value',
        Fn: async () => {
            const w = W();
            await EnsureTallied();
            const problems: string[] = [];
            const forbiddenKey = /voter|person|email|receipt|participation|ballotid|castballot|user|sourcekey|pin|credential|castat|timestamp|order/i;
            const allowedKeys = new Set(['Success', 'Message', 'Visible', 'Reason', 'IsFinal', 'IsRunning', 'SnapshotAt', 'BallotCount', 'Contests', 'ContestID', 'Outcome', 'VotesCast', 'Abstentions', 'Options', 'OptionID', 'Votes', 'Position', 'Rounds', 'Round', 'Tallies', 'Elected', 'Excluded', 'Transfers', 'Exhausted', 'Note', 'TieBroken', 'Notes']);
            for (const e of [w.S, w.C, w.O]) {
                const rollIDs = new Set<string>();
                for (const v of e.E.Voters.values()) for (const s of [v.EligibleVoterID, v.PersonID, v.Email, v.SourceKey]) rollIDs.add(s.toLowerCase());
                const receipts = new Set(e.Casts.map((c) => c.Receipt.toLowerCase()));
                const voter = w.Guests.get(`${e.E.Slug}/${e.Casts[0].Label}`) as WireClient;
                const asVoter = await voter.Call(new VotingGetResultsOperation(), { ElectionID: e.E.ElectionID });
                if (!(asVoter.Success && asVoter.Output?.Visible === true)) {
                    problems.push(`${e.Mode}: an eligible voter (guest session minted before the close) does not get the final results (${Describe(asVoter)})`);
                }
                // The shape scan runs on what the administrator receives, so a failing voter path cannot hide a leak.
                const r = await w.Admin.Call(new VotingGetResultsOperation(), { ElectionID: e.E.ElectionID });
                if (!(r.Success && r.Output?.Visible === true)) {
                    problems.push(`${e.Mode}: the administrator does not get the final results (${Describe(r)})`);
                    continue;
                }
                const walk = (v: unknown, path: string): void => {
                    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`));
                    if (v && typeof v === 'object') {
                        for (const [k, val] of Object.entries(v)) {
                            if (/^[0-9a-f-]{36}$/i.test(k)) {
                                // keyed by option id (Tallies / Transfers)
                                walk(val, `${path}.${k}`);
                                continue;
                            }
                            if (forbiddenKey.test(k)) problems.push(`${e.Mode}: results member ${path}.${k} looks like per-voter data`);
                            if (!allowedKeys.has(k)) problems.push(`${e.Mode}: results member ${path}.${k} is not part of the documented shape`);
                            walk(val, `${path}.${k}`);
                        }
                    } else if (typeof v === 'string') {
                        if (rollIDs.has(v.toLowerCase())) problems.push(`${e.Mode}: results value at ${path} is a roll identifier`);
                        if (receipts.has(v.toLowerCase())) problems.push(`${e.Mode}: results value at ${path} is a receipt`);
                    }
                };
                walk(r.Output, 'results');
                // Totals are consistent with what was cast: 6 ballots, even/odd voters split 3/3.
                const total = (r.Output?.Contests ?? []).reduce((s, c) => s + c.VotesCast, 0);
                if (total !== 6) problems.push(`${e.Mode}: VotesCast total ${total}, expected 6`);
                // Audience gate: the outsider (no person) and a non-roll member are not eligible.
                for (const who of ['outsider', 'outsider-known'] as const) {
                    const o = await (await w.Cast.As(who)).Call(new VotingGetResultsOperation(), { ElectionID: e.E.ElectionID });
                    if (o.Output?.Visible === true) problems.push(`${e.Mode}: ${who} (not eligible) sees results meant for the Eligible audience`);
                }
            }
            Assert(problems.length === 0, [...new Set(problems)].join('\n         - '));
        },
    },
    {
        Id: `${BUNDLE}.X10`,
        Name: 'X10 - the cast order is not recoverable from ids or storage order (before and after the tally)',
        Fn: async () => {
            const w = W();
            await EnsureTallied();
            const problems: string[] = [];
            const order = new Map<string, number>(); // receipt -> cast order
            for (const e of [w.S, w.C, w.O]) {
                const ballots = await SystemRows('Cast Ballots', `ElectionID = '${e.E.ElectionID}'`);
                const casts = new Map(e.Casts.map((c) => [c.Receipt, c.CastOrder] as const));
                const byStorage = ballots.map((b) => casts.get(String(b.ReceiptCode)) ?? -1);
                const rhoStorage = Spearman(byStorage, byStorage.map((_, i) => i));
                const byId = [...ballots].sort((x, y) => String(x.ID).localeCompare(String(y.ID))).map((b) => casts.get(String(b.ReceiptCode)) ?? -1);
                const rhoId = Spearman(byId, byId.map((_, i) => i));
                if (Math.abs(rhoStorage) === 1) problems.push(`${e.Mode}: storage order of CastBallot equals cast order (rho=${rhoStorage})`);
                if (Math.abs(rhoId) === 1) problems.push(`${e.Mode}: id order of CastBallot equals cast order (rho=${rhoId})`);
                // After the tally, selection rows must not be in cast order either, and carry no time.
                const sels = await SystemRows('Ballot Selections', `CastBallotID IN (${ballots.map((b) => `'${b.ID}'`).join(',')})`);
                if (sels.length > 0) {
                    const ballotOrder = new Map(ballots.map((b) => [String(b.ID).toLowerCase(), casts.get(String(b.ReceiptCode)) ?? -1] as const));
                    const seq = sels.map((s) => ballotOrder.get(String(s.CastBallotID).toLowerCase()) ?? -1);
                    if (Math.abs(Spearman(seq, seq.map((_, i) => i))) === 1) problems.push(`${e.Mode}: BallotSelection storage order equals cast order`);
                    for (const s of sels) for (const k of Object.keys(s)) if (/At$|^_mj_/.test(k)) problems.push(`BallotSelection exposes a time column ${k}`);
                } else {
                    problems.push(`${e.Mode}: no BallotSelection rows after the tally (cannot assess)`);
                }
                for (const c of e.Casts) order.set(c.Receipt, c.CastOrder);
            }
            Assert(problems.length === 0, [...new Set(problems)].join('\n         - '));
        },
    },
    {
        Id: `${BUNDLE}.X11`,
        Name: 'X11 - below the minimum-cast threshold running results are withheld from the audience; the final result of record is published (documented model)',
        Fn: async () => {
            // The k-threshold (ResultsMinCast, default 5) closes the DIFFERENCING channel while voting is open: someone who
            // knows who just voted must not watch the totals move (plans/bizapps-voting-design.md, "Threshold"; privacy.ts
            // ResultsVisible). It does not withhold the final result: the tally is the result of record, and with one ballot
            // even the bare outcome (Passed/Failed) reveals that ballot, so hiding the counts would protect nothing. That
            // inherent small-electorate disclosure is a documented limitation, asserted here as the model rather than hidden.
            const w = W();
            const e = await BuildWorldElection(w.Cast, w.Admin, { Voters: ['member1', 'member2', 'member3'], SecrecyMode: 'Secret', ResultsTiming: 'Live', ResultsAudience: 'Eligible', SlugPrefix: 'wire-s1' });
            const rows = await SystemRows('Elections', `ID = '${e.ElectionID}'`);
            const minCast = Number(rows[0]?.ResultsMinCast ?? 0);
            Assert(minCast > 1, `the election has no minimum-cast threshold (ResultsMinCast=${minCast}); nothing to assess`);
            const lone = await CastWith(await w.Cast.As('member1'), e.ElectionID, 0);
            Assert(lone.Success, `lone cast failed: ${lone.Message}`);

            // While open: Live results to an eligible audience, but one ballot is below k, so nothing is shown.
            const member2 = await w.Cast.As('member2');
            const running = await member2.Call(new VotingGetResultsOperation(), { ElectionID: e.ElectionID });
            Assert(running.Success && running.Output?.Success === true, `GetResults did not answer while open: ${Describe(running)}`);
            AssertEqual(running.Output?.Visible, false, `ResultsMinCast=${minCast}: running results of ONE ballot must be withheld from the Live audience`);
            Assert((running.Output?.Reason ?? '').includes(`at least ${minCast} ballots`), `the refusal names the threshold (got "${running.Output?.Reason}")`);
            Assert(!(running.Output?.Contests ?? []).some((c) => c.Options.some((o) => o.Votes > 0)), 'no running count leaks with the refusal');

            // After the tally: the result of record is published to the audience, aggregate only.
            const err = await CloseAndTally(e);
            Assert(err === null, `could not tally the 1-ballot election: ${err}`);
            const final = await member2.Call(new VotingGetResultsOperation(), { ElectionID: e.ElectionID });
            Assert(final.Success && final.Output?.Success === true, `GetResults did not answer after the tally: ${Describe(final)}`);
            AssertEqual(final.Output?.Visible, true, 'the final result of record is visible to the eligible audience (MinCast guards running results only)');
            AssertEqual(final.Output?.IsFinal, true, 'it is the final result');
            AssertEqual(final.Output?.BallotCount, 1, 'one ballot counted');
        },
    },
    {
        Id: `${BUNDLE}.X12`,
        Name: 'X12 - credential secrets (PIN hashes, control-number hashes, distribution keys, roster keys) are unreadable to non-administrators',
        Fn: async () => {
            const w = W();
            const problems: string[] = [];
            const targets: Array<{ Entity: string; Fields: string[] }> = [
                { Entity: 'Voter Credentials', Fields: ['SecretHash', 'ControlNumberHash'] },
                { Entity: 'Ballot Distributions', Fields: ['DistributionKey'] },
                { Entity: 'Eligible Voters', Fields: ['SourceKey'] },
            ];
            const identities: Array<[string, RawCredential]> = [
                ['inspector', PersonaCred('inspector')],
                ['member', PersonaCred('member1')],
                ['outsider', PersonaCred('outsider')],
                ['trustee', PersonaCred('trustee1')],
                ['guest', { Kind: 'bearer', Token: w.GuestToken }],
            ];
            for (const [who, cred] of identities) {
                for (const t of targets) {
                    if (t.Entity === 'Voter Credentials' || who !== 'inspector') {
                        const info = Info(t.Entity);
                        const r = await RawRunView(cred, info.ClassName, P + t.Entity, ['ID', ...t.Fields], { MaxRows: 20 });
                        if (!r.Ran) continue;
                        for (const f of t.Fields) {
                            const values = r.Rows.map((row) => row[f]).filter((v) => typeof v === 'string' && v.length > 0) as string[];
                            if (values.length > 0) problems.push(`${who} can read ${values.length} ${t.Entity}.${f} value(s), e.g. "${values[0].slice(0, 7)}..."`);
                        }
                    }
                }
            }
            Assert(problems.length === 0, `${problems.length} secret column(s) exposed:\n         - ${problems.join('\n         - ')}`);
        },
    },
    {
        Id: `${BUNDLE}.X13`,
        Name: 'X13 - a member reading a frozen election row sees no roll source detail and only documented Configuration keys; an undeclared key is refused',
        Fn: async () => {
            const w = W();
            const ids = [w.S, w.C, w.O].map((e) => `'${e.E.ElectionID}'`).join(',');
            const r = await RawRunView(PersonaCred('member1'), Info('Elections').ClassName, P + 'Elections', ['ID', 'EligibilitySourceSettings', 'Configuration'], { ExtraFilter: `ID IN (${ids})`, MaxRows: 10 });
            Assert(r.Ran, `a member reads frozen elections (the documented UI grant): ${r.Message}`);
            AssertEqual(r.Rows.length, 3, 'all three frozen elections are visible to the member');
            const problems: string[] = [];
            for (const row of r.Rows) {
                const settings = typeof row.EligibilitySourceSettings === 'string' ? row.EligibilitySourceSettings : '';
                const keys = settings ? Object.keys(JSON.parse(settings) as Record<string, unknown>).sort().join(',') : '';
                if (keys !== 'SettingsRedactedAtFreeze,SettingsSha256') problems.push(`election ${String(row.ID)}: source settings keys are "${keys}"`);
                for (const p of w.People) if (settings.toLowerCase().includes(p.Email.toLowerCase())) problems.push(`election ${String(row.ID)}: a roll email is readable`);
                const config = typeof row.Configuration === 'string' && row.Configuration.trim() ? (JSON.parse(row.Configuration) as Record<string, unknown>) : {};
                for (const key of Object.keys(config)) if (!ELECTION_CONFIGURATION_KEYS.includes(key)) problems.push(`election ${String(row.ID)}: undocumented Configuration key ${key}`);
            }
            Assert(problems.length === 0, `${problems.length} exposure(s):\n         - ${problems.join('\n         - ')}`);

            const refused = await w.Admin.Call(new VotingCreateElectionOperation(), {
                ElectionTypeCode: 'motion',
                Name: `wire-secrecy undeclared ${randomBytes(3).toString('hex')}`,
                EligibilitySource: { Code: 'csv', Settings: { Rows: [{ Email: w.People[0].Email, SourceKey: 'k0' }] } },
                Contests: [{ Name: 'Motion', Kind: 'Motion', TallyMethodCode: 'majority', Threshold: 'Majority', Options: [{ Label: 'Yes' }, { Label: 'No' }] }],
                Configuration: { Quorum: { Kind: 'Count', Value: 1 }, AdminNotes: 'private remark' },
            });
            Assert(refused.Success && refused.Output?.Success === false, 'a Configuration with an undeclared key is declined');
            Assert((refused.Output?.Message ?? '').includes('AdminNotes'), `the refusal names the key (got "${refused.Output?.Message ?? ''}")`);
        },
    },
];

for (const check of checks) IntegrationCheckRegistry.Instance.Register(check);

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (_ctx: IntegrationCheckContext) => {
        tallied = false;
        const cast = await WireCast.Create();
        const admin = await cast.As('admin');
        const tag = randomBytes(3).toString('hex');
        const people = await CreatePeople(cast.System, `sec-${tag}`, 6);
        const guests = new Map<string, WireClient>();
        const S = await CastAll('Secret', people, cast, admin, guests);
        const C = await CastAll('Confidential', people, cast, admin, guests);
        const O = await CastAll('Open', people, cast, admin, guests);
        const v = S.E.Voters.get(people[0].Label);
        if (!v) throw new Error('voter 0 missing');
        const session = await GetGuestSession(S.E.Slug, { SourceKey: v.SourceKey, Pin: v.Pin });
        world = { Cast: cast, Admin: admin, People: people, S, C, O, Guests: guests, GuestToken: session.Token };
    },
    Teardown: async (_ctx: IntegrationCheckContext) => {
        if (world) for (const e of [world.S, world.C, world.O]) await CloseWorldElection(world.Admin, e.E);
        world = undefined;
    },
});
