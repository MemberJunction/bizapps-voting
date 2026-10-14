/**
 * wire-access: the access MATRIX of BizApps Voting over the wire. The tables below ARE the specification of the intended
 * permission model; a mismatch is a finding (or a stale spec), never something to paper over.
 *
 *   A01..A09  all 29 Remote Operations x one identity column each (system, admin, inspector, member on the roll, member
 *             NOT on the roll, outsider without a Person, guest session of this election, guest session of ANOTHER
 *             election, trustee): FORBIDDEN by the operation's Authorize, or it RUNS (and, where the model says so, the
 *             logical refusal carries the right reason)
 *   A10       SubmitKeyShare on a real tier-B election: only the trustee, and only their own share, is accepted
 *   A11       the operation table covers exactly the operations the metadata declares
 *   E01..E07  direct entity access over RAW GraphQL (read via RunDynamicView, create, update, delete) on every voting
 *             entity x identity column; the model: catalogs readable by all, roll / credentials / poll book / audit /
 *             pre-publication results only for the administrators and inspectors, the ballot box for nobody, and NO
 *             DELETE on the poll book, audit trail, roll or ballot box for anyone
 *   E08       the entity table covers exactly the voting entities the host serves
 *
 * Cells use Y (must be allowed), N (must be refused) and ? (not asserted; the observed outcome is not a finding).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Assert, AssertEqual, IntegrationCheckRegistry, type IntegrationCheckContext, type NamedCheck } from '@memberjunction/testing-integration/registry';
import type { RemoteOpResult } from '@memberjunction/core';
import {
    VotingAmendRollOperation,
    VotingCancelElectionOperation,
    VotingCastBallotOperation,
    VotingCertifyOperation,
    VotingChallengeVoterOperation,
    VotingCloseElectionOperation,
    VotingCloseNominationsOperation,
    VotingCreateElectionOperation,
    VotingCreateTrusteeKeysOperation,
    VotingDecideNominationOperation,
    VotingDecideProxyOperation,
    VotingEnterPaperBallotOperation,
    VotingFreezeRollOperation,
    VotingGetMyBallotOperation,
    VotingGetMyParticipationOperation,
    VotingGetResultsOperation,
    VotingGetTurnoutOperation,
    VotingIssueControlNumbersOperation,
    VotingIssueCredentialsOperation,
    VotingIssueSecondFactorPinsOperation,
    VotingOpenElectionOperation,
    VotingOpenNominationsOperation,
    VotingResolveCommentOperation,
    VotingSubmitKeyShareOperation,
    VotingSubmitNominationOperation,
    VotingSubmitProxyOperation,
    VotingTallyOperation,
    VotingUpdateElectionOperation,
    VotingVerifyReceiptOperation,
    type mjBizAppsVotingElectionAnchorEntity,
} from '@mj-biz-apps/voting-entities';
import { GetGuestSession } from '../wire/guest-session.js';
import { RawDelete, RawCreateEmpty, RawRunView, RawUpdate, RawUpdateKeyOnly, type RawCredential } from '../wire/raw-graphql.js';
import { BuildWorldElection, CastWith, CloseWorldElection, Describe, GuestFor, NoSuchID, type WorldElection } from '../wire/vote-world.js';
import type { PersonaKey } from '../wire/persona-model.js';
import { RequirePersona } from '../wire/persona-store.js';
import { WireCast } from '../wire/wire-cast.js';
import type { WireClient } from '../wire/wire-client.js';

const BUNDLE = 'wire-access';
const VOTING_PREFIX = 'MJ_BizApps_Voting: ';

type OpResult = RemoteOpResult<{ Success: boolean; Message?: string }>;

// ─── World ───────────────────────────────────────────────────────────────────

interface AccessWorld {
    Cast: WireCast;
    Admin: WireClient;
    /** Election A: members 1..3 on the roll, member2 has voted. */
    A: WorldElection;
    /** Election B: member4 only. */
    B: WorldElection;
    /** Victim election: the rows destructive probes aim at. */
    V: WorldElection;
    GuestA: WireClient;
    GuestB: WireClient;
    /** Row ids (scoped to the victim election where the table allows) for update/delete probes. */
    Targets: Map<string, string>;
    /** Rows OUTSIDE the victim election, for tables where it has none: used by the key-only UPDATE probe only, never deleted. */
    UpdateOnlyTargets: Map<string, string>;
    /** A Draft election (definition only) for the definition-tampering probes. */
    D: WorldElection;
    GuestAToken: string;
}

let world: AccessWorld | undefined;
function W(): AccessWorld {
    if (!world) throw new Error('wire-access setup did not run');
    return world;
}

// ─── Operation matrix ────────────────────────────────────────────────────────

type Gate = 'admin' | 'admin+inspector' | 'voter' | 'trustee';
type Column = 'system' | 'admin' | 'inspector' | 'member-on-roll' | 'member-not-on-roll' | 'outsider' | 'guest-own' | 'guest-other' | 'trustee';
const COLUMNS: readonly Column[] = ['system', 'admin', 'inspector', 'member-on-roll', 'member-not-on-roll', 'outsider', 'guest-own', 'guest-other', 'trustee'];

const COLUMN_PERSONA: Partial<Record<Column, PersonaKey>> = {
    admin: 'admin',
    inspector: 'inspector',
    'member-on-roll': 'member1',
    'member-not-on-roll': 'outsider-known',
    outsider: 'outsider',
    trustee: 'trustee1',
};

interface OpSpec {
    Key: string;
    Gate: Gate;
    /** The voter operations that identify the caller against the roll: the refusal for a caller not on it must say so. */
    RollChecked?: boolean;
    Run: (c: WireClient, w: AccessWorld) => Promise<OpResult>;
}

const none = (): string => NoSuchID();

const OPS: readonly OpSpec[] = [
    { Key: 'Voting.AmendRoll', Gate: 'admin', Run: (c) => c.Call(new VotingAmendRollOperation(), { ElectionID: none(), Add: [], Remove: [] }) },
    { Key: 'Voting.CancelElection', Gate: 'admin', Run: (c) => c.Call(new VotingCancelElectionOperation(), { ElectionID: none(), Reason: 'matrix' }) },
    { Key: 'Voting.CastBallot', Gate: 'voter', RollChecked: true, Run: (c, w) => c.Call(new VotingCastBallotOperation(), { ElectionID: w.A.ElectionID, BallotStyleHash: 'stale', Submission: { Contests: [] } }) },
    { Key: 'Voting.Certify', Gate: 'admin+inspector', Run: (c) => c.Call(new VotingCertifyOperation(), { ElectionID: none() }) },
    { Key: 'Voting.ChallengeVoter', Gate: 'admin', Run: (c) => c.Call(new VotingChallengeVoterOperation(), { EligibleVoterID: none(), Reason: 'matrix' }) },
    { Key: 'Voting.CloseElection', Gate: 'admin', Run: (c) => c.Call(new VotingCloseElectionOperation(), { ElectionID: none() }) },
    { Key: 'Voting.CloseNominations', Gate: 'admin', Run: (c) => c.Call(new VotingCloseNominationsOperation(), { ElectionID: none() }) },
    {
        Key: 'Voting.CreateElection',
        Gate: 'admin',
        Run: (c) =>
            c.Call(new VotingCreateElectionOperation(), {
                ElectionTypeCode: 'zz-no-such-type',
                Name: 'matrix',
                EligibilitySource: { Code: 'csv', Settings: { Rows: [] } },
                Contests: [],
            }),
    },
    { Key: 'Voting.CreateTrusteeKeys', Gate: 'admin', Run: (c) => c.Call(new VotingCreateTrusteeKeysOperation(), { ElectionID: none(), TrusteePersonIDs: [], Threshold: 2 }) },
    { Key: 'Voting.DecideNomination', Gate: 'admin', Run: (c) => c.Call(new VotingDecideNominationOperation(), { NominationID: none(), Decision: 'Rejected' }) },
    { Key: 'Voting.DecideProxy', Gate: 'admin', Run: (c) => c.Call(new VotingDecideProxyOperation(), { ProxyDesignationID: none(), Decision: 'Rejected' }) },
    { Key: 'Voting.EnterPaperBallot', Gate: 'admin', Run: (c) => c.Call(new VotingEnterPaperBallotOperation(), { ElectionID: none(), ControlNumber: 'x', Channel: 'Paper', Submission: { Contests: [] } }) },
    { Key: 'Voting.FreezeRoll', Gate: 'admin', Run: (c) => c.Call(new VotingFreezeRollOperation(), { ElectionID: none() }) },
    { Key: 'Voting.GetMyBallot', Gate: 'voter', RollChecked: true, Run: (c, w) => c.Call(new VotingGetMyBallotOperation(), { ElectionID: w.A.ElectionID }) },
    { Key: 'Voting.GetMyParticipation', Gate: 'voter', RollChecked: true, Run: (c, w) => c.Call(new VotingGetMyParticipationOperation(), { ElectionID: w.A.ElectionID }) },
    { Key: 'Voting.GetResults', Gate: 'voter', Run: (c, w) => c.Call(new VotingGetResultsOperation(), { ElectionID: w.A.ElectionID }) },
    { Key: 'Voting.GetTurnout', Gate: 'admin+inspector', Run: (c) => c.Call(new VotingGetTurnoutOperation(), { ElectionID: none() }) },
    { Key: 'Voting.IssueControlNumbers', Gate: 'admin', Run: (c) => c.Call(new VotingIssueControlNumbersOperation(), { ElectionID: none() }) },
    { Key: 'Voting.IssueCredentials', Gate: 'admin', Run: (c) => c.Call(new VotingIssueCredentialsOperation(), { ElectionID: none(), MethodCode: 'emailed-link' }) },
    { Key: 'Voting.IssueSecondFactorPins', Gate: 'admin', Run: (c) => c.Call(new VotingIssueSecondFactorPinsOperation(), { ElectionID: none() }) },
    { Key: 'Voting.OpenElection', Gate: 'admin', Run: (c) => c.Call(new VotingOpenElectionOperation(), { ElectionID: none() }) },
    { Key: 'Voting.OpenNominations', Gate: 'admin', Run: (c) => c.Call(new VotingOpenNominationsOperation(), { ElectionID: none() }) },
    { Key: 'Voting.ResolveComment', Gate: 'admin', Run: (c) => c.Call(new VotingResolveCommentOperation(), { BallotCommentID: none(), Disposition: 'Acknowledged' }) },
    { Key: 'Voting.SubmitKeyShare', Gate: 'trustee', Run: (c, w) => c.Call(new VotingSubmitKeyShareOperation(), { ElectionID: w.A.ElectionID, ShareIndex: 1, Share: 'aa' }) },
    { Key: 'Voting.SubmitNomination', Gate: 'voter', Run: (c) => c.Call(new VotingSubmitNominationOperation(), { ContestID: none(), NomineePersonID: none() }) },
    { Key: 'Voting.SubmitProxy', Gate: 'voter', Run: (c, w) => c.Call(new VotingSubmitProxyOperation(), { ElectionID: w.A.ElectionID, ProxyPersonID: none() }) },
    { Key: 'Voting.Tally', Gate: 'admin', Run: (c) => c.Call(new VotingTallyOperation(), { ElectionID: none() }) },
    { Key: 'Voting.UpdateElection', Gate: 'admin', Run: (c) => c.Call(new VotingUpdateElectionOperation(), { ElectionID: none(), Description: 'matrix' }) },
    { Key: 'Voting.VerifyReceipt', Gate: 'voter', Run: (c, w) => c.Call(new VotingVerifyReceiptOperation(), { ElectionID: w.A.ElectionID, ReceiptCode: 'AAAA-AAAA-AAAA-AAAA-AAAA' }) },
];

type OpExpectation = { Outcome: 'FORBIDDEN' } | { Outcome: 'RUNS'; Roll?: 'on' | 'off' };

/** The spec: what each identity column must get from each operation. */
function ExpectedOp(op: OpSpec, column: Column): OpExpectation {
    const guest = column === 'guest-own' || column === 'guest-other';
    if (guest) {
        if (op.Gate === 'voter' && op.Key === 'Voting.SubmitNomination') return { Outcome: 'RUNS' }; // a ballot session passes Authorize; the contest's election is checked inside
        if (op.Gate !== 'voter') return { Outcome: 'FORBIDDEN' };
        return column === 'guest-own' ? { Outcome: 'RUNS', Roll: op.RollChecked ? 'on' : undefined } : { Outcome: 'FORBIDDEN' };
    }
    const admin = column === 'system' || column === 'admin';
    const allowed =
        op.Gate === 'admin' ? admin : op.Gate === 'admin+inspector' ? admin || column === 'inspector' : true; // voter and trustee operations authorize every signed-in principal; the engine decides from the roll / trustee table
    if (!allowed) return { Outcome: 'FORBIDDEN' };
    if (!op.RollChecked) return { Outcome: 'RUNS' };
    return { Outcome: 'RUNS', Roll: column === 'member-on-roll' ? 'on' : 'off' };
}

function ClientFor(column: Column): Promise<WireClient> {
    const w = W();
    if (column === 'system') return Promise.resolve(w.Cast.System);
    if (column === 'guest-own') return Promise.resolve(w.GuestA);
    if (column === 'guest-other') return Promise.resolve(w.GuestB);
    return w.Cast.As(COLUMN_PERSONA[column] as PersonaKey);
}

const NOT_ON_ROLL = /not on the roll/i;

function EvaluateOp(op: OpSpec, column: Column, result: OpResult): string | null {
    const expected = ExpectedOp(op, column);
    const forbidden = !result.Success && (result.ResultCode === 'FORBIDDEN' || result.ResultCode === 'UNAUTHORIZED' || result.ResultCode === 'UNAUTHENTICATED');
    if (expected.Outcome === 'FORBIDDEN') {
        return forbidden ? null : `${op.Key}: expected FORBIDDEN, observed ${Describe(result)}`;
    }
    if (forbidden) return `${op.Key}: expected to RUN (authorized), observed ${result.ResultCode}: ${result.ErrorMessage}`;
    if (!result.Success) return `${op.Key}: expected to RUN, but the call itself failed: ${result.ResultCode}: ${result.ErrorMessage}`;
    if (expected.Roll === 'on' && (!result.Output || NOT_ON_ROLL.test(result.Output.Message ?? ''))) {
        return `${op.Key}: a voter ON the roll was told "${result.Output?.Message}"`;
    }
    if (expected.Roll === 'off') {
        if (result.Output?.Success !== false) return `${op.Key}: a caller NOT on the roll was served (Output.Success=${result.Output?.Success})`;
        if (!NOT_ON_ROLL.test(result.Output.Message ?? '')) return `${op.Key}: refusal for a caller not on the roll does not say so: "${result.Output.Message}"`;
    }
    return null;
}

function OpColumnCheck(index: number, column: Column): NamedCheck {
    return {
        Id: `${BUNDLE}.A${String(index).padStart(2, '0')}`,
        Name: `A${String(index).padStart(2, '0')} - operation matrix, column "${column}" (${OPS.length} operations)`,
        Fn: async () => {
            const client = await ClientFor(column);
            const diffs: string[] = [];
            // Voter operations that read state run before anything can change it; order is irrelevant for refusals.
            for (const op of OPS) {
                const result = await op.Run(client, W());
                const diff = EvaluateOp(op, column, result);
                if (diff) diffs.push(diff);
            }
            Assert(diffs.length === 0, `${diffs.length} of ${OPS.length} cells differ from the spec for "${column}":\n         - ${diffs.join('\n         - ')}`);
        },
    };
}

// ─── Entity matrix ───────────────────────────────────────────────────────────

type Cell = 'Y' | 'N' | '?';
/** Column order of every verb string: system, admin, inspector, member (also the trustee), outsider, guest. */
const ENTITY_COLUMNS = ['system', 'admin', 'inspector', 'member', 'outsider', 'guest', 'trustee'] as const;
type EntityColumn = (typeof ENTITY_COLUMNS)[number];

interface EntitySpec {
    Name: string;
    /** Six cells: S A I M O G (trustee = member). */
    Read: string;
    Create: string;
    Update: string;
    Delete: string;
    Why: string;
}

function Spec(Name: string, Read: string, Create: string, Update: string, Delete: string, Why: string): EntitySpec {
    for (const v of [Read, Create, Update, Delete]) if (!/^[YN?]{6}$/.test(v)) throw new Error(`bad cell string "${v}" for ${Name}`);
    return { Name, Read, Create, Update, Delete, Why };
}

const CATALOG = { Read: 'YYYYY?', Create: '?NNNNN', Update: '?NNNNN', Delete: '?NNNNN', Why: 'catalog: readable by all, written by metadata sync only (docs/voting/security.md)' };
// Columns: S A I M(=UI, also trustee) O(=UI, no Person) G. Member and outsider both hold only UI: what UI reads (row-filtered:
// frozen-roll configuration, certified certifications, Open-ballot comments) both may RUN; the guest holds no grant at all.
const CONFIG = { Read: 'YYYYYN', Create: '?YNNNN', Update: '?YNNNN', Delete: '?NNNNN', Why: 'election configuration: UI reads frozen-roll rows, administrators write, inspectors read' };
const BALLOT_BOX = { Read: '?NNNNN', Create: '?NNNNN', Update: '?NNNNN', Delete: 'NNNNNN', Why: 'ballot box: only the engine (system) touches it; no API reads for anyone else; no delete for anyone' };
const D = '?NNNNN'; // nobody deletes through the API; the system cell is not asserted (effective deletion is E10)

/** The model of docs/voting/security.md (grant matrix). */
const ENTITIES: readonly EntitySpec[] = [
    Spec('Election Types', CATALOG.Read, CATALOG.Create, CATALOG.Update, CATALOG.Delete, CATALOG.Why),
    Spec('Tally Methods', CATALOG.Read, CATALOG.Create, CATALOG.Update, CATALOG.Delete, CATALOG.Why),
    Spec('Eligibility Source Types', CATALOG.Read, CATALOG.Create, CATALOG.Update, CATALOG.Delete, CATALOG.Why),
    Spec('Voter Credential Methods', CATALOG.Read, CATALOG.Create, CATALOG.Update, CATALOG.Delete, CATALOG.Why),

    Spec('Elections', CONFIG.Read, CONFIG.Create, CONFIG.Update, CONFIG.Delete, CONFIG.Why),
    Spec('Contests', CONFIG.Read, CONFIG.Create, CONFIG.Update, CONFIG.Delete, CONFIG.Why),
    Spec('Contest Options', CONFIG.Read, CONFIG.Create, CONFIG.Update, CONFIG.Delete, CONFIG.Why),
    Spec('Standards Ballot Elections', CONFIG.Read, CONFIG.Create, CONFIG.Update, CONFIG.Delete, CONFIG.Why),
    Spec('Election Anchors', 'YYYNNN', '?YNNNN', '?YNNNN', D, 'anchors: administrators write, inspectors read, members none'),
    Spec('Nominations', 'YYYNNN', '?NNNNN', '?YNNNN', D, 'nominations: administrators decide (RU)'),
    Spec('Nomination Endorsements', 'YYYNNN', '?NNNNN', '?NNNNN', D, 'endorsements: read-only for administrators'),

    Spec('Eligible Voters', 'YYYNNN', '?YNNNN', '?YNNNN', D, 'the roll identifies voters: administrators/inspectors only'),
    Spec('Voter Credentials', 'YYNNNN', '?YNNNN', '?YNNNN', D, 'credentials: administrators only, never inspectors'),
    Spec('Ballot Distributions', 'YYYNNN', '?YNNNN', '?YNNNN', D, 'distribution key: administrators write, inspectors read'),
    Spec('Proxy Designations', 'YYYNNN', '?NNNNN', '?YNNNN', D, 'proxies: administrators decide'),

    Spec('Participations', 'YYYNNN', '?NNNNN', '?NNNNN', D, 'the poll book: administrators and inspectors READ ONLY; engine writes'),
    Spec('Election Audit Events', 'YYYNNN', '?YYNNN', '?NNNNN', D, 'the audit trail: append-only (create for administrators/inspectors, no update)'),

    Spec('Result Snapshots', 'YYYNNN', '?NNNNN', '?NNNNN', D, 'pre-publication results: read-only for administrators/inspectors'),
    Spec('Contest Results', 'YYYNNN', '?YNNNN', '?YNNNN', D, 'pre-publication results: administrators write (tally), inspectors read'),
    Spec('Contest Option Results', 'YYYNNN', '?YNNNN', '?YNNNN', D, 'pre-publication results: administrators write (tally), inspectors read'),
    Spec('Election Certifications', 'YYYYYN', '?YYNNN', '?YYNNN', D, 'certification: signed by administrators and inspectors; every UI user reads certified rows'),
    Spec('Election Certifiers', 'YYYYYN', '?YYNNN', '?YYNNN', D, 'certification: signed by administrators and inspectors; every UI user reads certified rows'),

    Spec('Election Trustees', 'YYNNNN', '?YNNNN', '?YNNNN', D, 'tier-B roster: administrators only'),
    Spec('Trustee Key Commitments', 'YYNNNN', '?YNNNN', 'NNNNNN', D, 'tier-B commitments: administrators create and read (the key ceremony); a published commitment is never rewritten, not even by the engine'),

    Spec('Ballot Comments', 'YYYYYN', '?NNNNN', '?NNNNN', D, 'comments: every UI user reads Open ballots only; written by the engine'),
    Spec('Comment Resolutions', 'YYYYYN', '?YNNNN', '?YNNNN', D, 'resolutions: every UI user reads Open ballots only; administrators write'),

    Spec('Cast Ballots', BALLOT_BOX.Read, BALLOT_BOX.Create, BALLOT_BOX.Update, BALLOT_BOX.Delete, BALLOT_BOX.Why),
    Spec('Ballot Selections', BALLOT_BOX.Read, BALLOT_BOX.Create, BALLOT_BOX.Update, BALLOT_BOX.Delete, BALLOT_BOX.Why),
    Spec('Contest Running Tallies', BALLOT_BOX.Read, BALLOT_BOX.Create, BALLOT_BOX.Update, BALLOT_BOX.Delete, BALLOT_BOX.Why),
    Spec('Ballot Attributions', BALLOT_BOX.Read, BALLOT_BOX.Create, BALLOT_BOX.Update, BALLOT_BOX.Delete, BALLOT_BOX.Why),
];

function CellOf(spec: string, column: EntityColumn): Cell {
    const index = column === 'trustee' ? 3 : ENTITY_COLUMNS.indexOf(column);
    return spec[index] as Cell;
}

function CredentialFor(column: EntityColumn): RawCredential {
    const w = W();
    switch (column) {
        case 'system':
            return { Kind: 'system' };
        case 'guest':
            return { Kind: 'bearer', Token: w.GuestAToken };
        case 'admin':
            return { Kind: 'user-key', Key: RequirePersona('admin').APIKey };
        case 'inspector':
            return { Kind: 'user-key', Key: RequirePersona('inspector').APIKey };
        case 'member':
            return { Kind: 'user-key', Key: RequirePersona('member1').APIKey };
        case 'outsider':
            return { Kind: 'user-key', Key: RequirePersona('outsider').APIKey };
        case 'trustee':
            return { Kind: 'user-key', Key: RequirePersona('trustee1').APIKey };
    }
}

interface EntityMeta {
    ClassName: string;
    FieldNames: string[];
}

function MetaOf(entityName: string): EntityMeta {
    const info = W().Cast.System.Provider.Entities.find((e) => e.Name === entityName);
    if (!info) throw new Error(`entity "${entityName}" is not in the host's metadata`);
    return { ClassName: info.ClassName, FieldNames: info.Fields.map((f) => f.Name) };
}

function Verdict(cell: Cell, allowed: boolean): boolean {
    return cell === '?' ? true : cell === 'Y' ? allowed : !allowed;
}

async function EvaluateEntity(spec: EntitySpec, column: EntityColumn): Promise<string[]> {
    const w = W();
    const full = VOTING_PREFIX + spec.Name;
    const meta = MetaOf(full);
    const cred = CredentialFor(column);
    const diffs: string[] = [];

    const read = await RawRunView(cred, meta.ClassName, full, ['ID'], { MaxRows: 5 });
    const readCell = CellOf(spec.Read, column);
    if (!Verdict(readCell, read.Ran)) {
        diffs.push(`${spec.Name} READ: expected ${readCell}, ${read.Ran ? `ALLOWED (${read.Rows.length} rows visible)` : `refused=${read.Refused}`}${read.Ran ? '' : ` (${read.Message.slice(0, 90)})`}`);
    }

    const create = await RawCreateEmpty(cred, meta.ClassName);
    const createAllowed = !create.Refused;
    const createCell = CellOf(spec.Create, column);
    if (!Verdict(createCell, createAllowed)) diffs.push(`${spec.Name} CREATE: expected ${createCell}, observed ${createAllowed ? `PASSED the permission gate (${create.Executed ? 'EXECUTED' : create.Message.slice(0, 80)})` : `refused (${create.Message.slice(0, 60)})`}`);

    const target = w.Targets.get(full) ?? NoSuchID();
    const update = await RawUpdateKeyOnly(cred, meta.ClassName, w.Targets.get(full) ?? w.UpdateOnlyTargets.get(full) ?? target);
    const updateAllowed = !update.Refused;
    const updateCell = CellOf(spec.Update, column);
    if (!Verdict(updateCell, updateAllowed)) diffs.push(`${spec.Name} UPDATE: expected ${updateCell}, observed ${updateAllowed ? `PASSED the permission gate (${update.Executed ? 'EXECUTED' : update.Message.slice(0, 80)})` : `refused (${update.Message.slice(0, 60)})`}`);

    const del = await RawDelete(cred, meta.ClassName, target);
    const deleteAllowed = !del.Refused;
    const deleteCell = CellOf(spec.Delete, column);
    if (!Verdict(deleteCell, deleteAllowed)) diffs.push(`${spec.Name} DELETE: expected ${deleteCell}, observed ${deleteAllowed ? `PASSED the permission gate (${del.Executed ? 'EXECUTED' : del.Message.slice(0, 80)})` : `refused (${del.Message.slice(0, 60)})`}`);
    return diffs;
}

function EntityColumnCheck(index: number, column: EntityColumn): NamedCheck {
    return {
        Id: `${BUNDLE}.E${String(index).padStart(2, '0')}`,
        Name: `E${String(index).padStart(2, '0')} - entity matrix over raw GraphQL, column "${column}" (${ENTITIES.length} entities x read/create/update/delete)`,
        Fn: async () => {
            const diffs: string[] = [];
            for (const spec of ENTITIES) diffs.push(...(await EvaluateEntity(spec, column)));
            Assert(diffs.length === 0, `${diffs.length} cells differ from the model for "${column}":\n         - ${diffs.join('\n         - ')}`);
        },
    };
}

/** Finds a row id of `entityName` that belongs to the victim election (following foreign keys up to three levels). */
function ScopeFilter(entityName: string, electionID: string, depth = 0): string | null {
    const info = W().Cast.System.Provider.Entities.find((e) => e.Name === entityName);
    if (!info || depth > 3) return null;
    if (info.Name === VOTING_PREFIX + 'Elections') return `ID = '${electionID}'`;
    if (info.Fields.some((f) => f.Name === 'ElectionID')) return `ElectionID = '${electionID}'`;
    for (const field of info.Fields) {
        if (!field.RelatedEntity || !field.RelatedEntity.startsWith(VOTING_PREFIX) || field.IsPrimaryKey) continue;
        const parent = W().Cast.System.Provider.Entities.find((e) => e.Name === field.RelatedEntity);
        const inner = parent ? ScopeFilter(parent.Name, electionID, depth + 1) : null;
        if (parent && inner) return `${field.Name} IN (SELECT ID FROM [${parent.SchemaName}].[${parent.BaseView}] WHERE ${inner})`;
    }
    return null;
}


const ALL_ENTITY_COLUMNS: readonly EntityColumn[] = ['system', 'admin', 'inspector', 'member', 'outsider', 'guest', 'trustee'];

interface TamperSpec {
    Entity: string;
    Field: string;
    /** Builds the attempted value from the column name (unique per column so an earlier success cannot hide a later one). */
    Value: (column: EntityColumn) => unknown;
    /** Columns allowed to change it (the engine). */
    MayChange: readonly EntityColumn[];
}

const TAMPERS: readonly TamperSpec[] = [
    { Entity: 'Participations', Field: 'CastAt', Value: (c) => `2001-01-0${ALL_ENTITY_COLUMNS.indexOf(c) + 1}T00:00:00.000Z`, MayChange: [] },
    { Entity: 'Election Audit Events', Field: 'Details', Value: (c) => `tampered-by-${c}`, MayChange: [] },
    { Entity: 'Eligible Voters', Field: 'Weight', Value: (c) => 90 + ALL_ENTITY_COLUMNS.indexOf(c), MayChange: [] },
    { Entity: 'Ballot Selections', Field: 'IsAbstain', Value: () => true, MayChange: [] },
    { Entity: 'Cast Ballots', Field: 'ReceiptCode', Value: (c) => `TAMPER-${c}`, MayChange: ['system'] },
    { Entity: 'Contest Running Tallies', Field: 'VoteCount', Value: (c) => 9000 + ALL_ENTITY_COLUMNS.indexOf(c), MayChange: ['system'] },
];

async function ReadField(entity: string, id: string, field: string): Promise<string | null> {
    const full = VOTING_PREFIX + entity;
    const meta = MetaOf(full);
    const r = await RawRunView({ Kind: 'system' }, meta.ClassName, full, ['ID', field], { ExtraFilter: `ID = '${id}'`, MaxRows: 1 });
    if (!r.Ran || !r.Rows[0]) return null;
    const v = r.Rows[0][field];
    return v === null || v === undefined ? null : String(v);
}

function SameValue(a: string | null, b: unknown): boolean {
    if (a === null) return b === null || b === undefined;
    if (typeof b === 'string' && /^\d{4}-\d\d-\d\dT/.test(b) && !Number.isNaN(Date.parse(a))) return Date.parse(a) === Date.parse(b);
    return a === String(b);
}

async function RowExists(entity: string, id: string): Promise<boolean> {
    const full = VOTING_PREFIX + entity;
    const r = await RawRunView({ Kind: 'system' }, MetaOf(full).ClassName, full, ['ID'], { ExtraFilter: `ID = '${id}'`, MaxRows: 1 });
    return r.Ran && r.Rows.length === 1;
}

/**
 * Election Anchors exist only where an app anchors an election to a record, and no wire election does, so the UPDATE probe
 * would have no real row. The administrator anchors the Draft election (to its own user record), which is also a create
 * the model allows them.
 */
async function AnchorDraftElection(cast: WireCast, admin: WireClient, draft: WorldElection): Promise<void> {
    const users = cast.System.Provider.Entities.find((e) => e.Name === 'MJ: Users');
    if (!users) throw new Error('"MJ: Users" is not in the host metadata');
    const anchor = await admin.NewEntity<mjBizAppsVotingElectionAnchorEntity>(VOTING_PREFIX + 'Election Anchors');
    anchor.NewRecord();
    anchor.ElectionID = draft.ElectionID;
    anchor.EntityID = users.ID;
    anchor.RecordID = cast.Record('admin').UserID;
    anchor.Role = 'Subject';
    if (!(await anchor.Save())) throw new Error(`setup: the administrator could not anchor the Draft election: ${anchor.LatestResult?.CompleteMessage ?? 'save failed'}`);
}

// ─── Checks ──────────────────────────────────────────────────────────────────

const checks: NamedCheck[] = [
    ...COLUMNS.map((column, i) => OpColumnCheck(i + 1, column)),
    {
        Id: `${BUNDLE}.A10`,
        Name: 'A10 - SubmitKeyShare on a real tier-B election: only the trustee, and only their own share, is accepted',
        Fn: async () => {
            const w = W();
            const trustees: PersonaKey[] = ['trustee1', 'trustee2', 'trustee3'];
            let shares: Array<{ TrusteePersonID: string; ShareIndex: number; Share: string }> = [];
            const election = await BuildWorldElection(w.Cast, w.Admin, {
                Voters: ['member1', 'member2', 'member3'],
                SecrecyMode: 'Secret',
                AssuranceTier: 'HighAssurance',
                ResultsTiming: 'AfterClose',
                SlugPrefix: 'wire-kb',
                AfterFreeze: async (electionID) => {
                    const keys = await w.Admin.Call(new VotingCreateTrusteeKeysOperation(), {
                        ElectionID: electionID,
                        TrusteePersonIDs: trustees.map((t) => w.Cast.Record(t).PersonID as string),
                        Threshold: 2,
                    });
                    Assert(keys.Success && keys.Output?.Success === true, `CreateTrusteeKeys failed: ${Describe(keys)}`);
                    shares = keys.Output?.Shares ?? [];
                },
            });
            Assert(shares.length === 3, 'three trustee shares were issued');
            const g = await GuestFor(election, 'member1');
            const cast = await CastWith(g, election.ElectionID, 0);
            Assert(cast.Success, `tier-B cast failed: ${cast.Message}`);
            await w.Admin.Call(new VotingCloseElectionOperation(), { ElectionID: election.ElectionID });

            const shareOf = (t: PersonaKey) => shares.find((s) => s.TrusteePersonID.toLowerCase() === (w.Cast.Record(t).PersonID as string).toLowerCase());
            const share1 = shareOf('trustee1');
            Assert(!!share1, 'trustee1 has a share');
            const diffs: string[] = [];
            // Everybody who is NOT trustee1 presents trustee1's real share: a share is not a bearer token.
            for (const who of ['admin', 'inspector', 'member1', 'outsider', 'outsider-known', 'trustee2'] as PersonaKey[]) {
                const c = await w.Cast.As(who);
                const r = await c.Call(new VotingSubmitKeyShareOperation(), { ElectionID: election.ElectionID, ShareIndex: share1!.ShareIndex, Share: share1!.Share });
                if (r.Success && r.Output?.Success === true) diffs.push(`${who} was ACCEPTED submitting trustee1's share`);
            }
            const sysTry = await w.Cast.System.Call(new VotingSubmitKeyShareOperation(), { ElectionID: election.ElectionID, ShareIndex: share1!.ShareIndex, Share: share1!.Share });
            if (sysTry.Success && sysTry.Output?.Success === true) diffs.push(`the system user was ACCEPTED submitting trustee1's share`);
            const guestTry = await g.Call(new VotingSubmitKeyShareOperation(), { ElectionID: election.ElectionID, ShareIndex: share1!.ShareIndex, Share: share1!.Share });
            if (guestTry.Success) diffs.push(`a guest ballot session was not FORBIDDEN from SubmitKeyShare (${Describe(guestTry)})`);
            // A tampered share from the real trustee is refused too.
            const t1 = await w.Cast.As('trustee1');
            const tampered = await t1.Call(new VotingSubmitKeyShareOperation(), { ElectionID: election.ElectionID, ShareIndex: share1!.ShareIndex, Share: share1!.Share.slice(0, -2) + (share1!.Share.endsWith('00') ? '11' : '00') });
            if (tampered.Success && tampered.Output?.Success === true) diffs.push('a tampered share was ACCEPTED');
            const good = await t1.Call(new VotingSubmitKeyShareOperation(), { ElectionID: election.ElectionID, ShareIndex: share1!.ShareIndex, Share: share1!.Share });
            if (!(good.Success && good.Output?.Success === true && good.Output.Accepted === true)) diffs.push(`trustee1's own share was not accepted: ${Describe(good)}`);
            Assert(diffs.length === 0, diffs.join('\n         - '));
        },
    },
    {
        Id: `${BUNDLE}.A11`,
        Name: 'A11 - the operation table covers exactly the operations the metadata declares',
        Fn: async () => {
            const here = dirname(fileURLToPath(import.meta.url));
            const file = resolve(here, '../../../../metadata/remote-operations/.voting-remote-operations.json');
            const declared = (JSON.parse(readFileSync(file, 'utf8')) as Array<{ fields: { Name: string } }>).map((r) => r.fields.Name.replace(/\s+/g, '').toLowerCase());
            const tabled = OPS.map((o) => o.Key.replace('Voting.', '').toLowerCase());
            AssertEqual(OPS.length, declared.length, 'operation count');
            for (const name of declared) Assert(tabled.includes(name), `operation "${name}" is declared but missing from the access matrix`);
            for (const name of tabled) Assert(declared.includes(name), `operation "${name}" is in the matrix but not declared`);
        },
    },

    {
        Id: `${BUNDLE}.A12`,
        Name: 'A12 - the Voting Administrator persona alone can run a whole election: open, vote, close, tally',
        Fn: async () => {
            const w = W();
            const e = await BuildWorldElection(w.Cast, w.Admin, { Voters: ['member1', 'member2'], SlugPrefix: 'wire-xl' });
            const cast = await CastWith(await GuestFor(e, 'member1'), e.ElectionID, 0);
            Assert(cast.Success, `cast failed: ${cast.Message}`);
            const closed = await w.Admin.Call(new VotingCloseElectionOperation(), { ElectionID: e.ElectionID });
            Assert(closed.Success && closed.Output?.Success === true, `admin could not close the election: ${Describe(closed)}`);
            const tallied = await w.Admin.Call(new VotingTallyOperation(), { ElectionID: e.ElectionID });
            Assert(tallied.Success && tallied.Output?.Success === true, `admin could not tally the election: ${Describe(tallied)}`);
            const turnout = await w.Admin.Call(new VotingGetTurnoutOperation(), { ElectionID: e.ElectionID });
            AssertEqual(turnout.Output?.Voted, 1, 'turnout after one ballot');
        },
    },
    {
        Id: `${BUNDLE}.E09`,
        Name: 'E09 - tamper attempts on immutable records (poll book, audit trail, roll weight, ballot box) never change the stored value, for any identity',
        Fn: async () => {
            const w = W();
            const diffs: string[] = [];
            for (const t of TAMPERS) {
                const full = VOTING_PREFIX + t.Entity;
                const id = w.Targets.get(full);
                if (!id) {
                    diffs.push(`${t.Entity}: no row in the victim election to attack (setup gap)`);
                    continue;
                }
                const meta = MetaOf(full);
                for (const column of ALL_ENTITY_COLUMNS) {
                    const before = await ReadField(t.Entity, id, t.Field);
                    const value = t.Value(column);
                    const res = await RawUpdate(CredentialFor(column), meta.ClassName, id, { [t.Field]: value });
                    const after = await ReadField(t.Entity, id, t.Field);
                    const changed = !SameValue(before, after) || (res.Executed && SameValue(after, value) && !SameValue(before, value));
                    if (changed && !t.MayChange.includes(column)) diffs.push(`${t.Entity}.${t.Field} was CHANGED by ${column} (${before} -> ${after})`);
                }
            }
            Assert(diffs.length === 0, `${diffs.length} tamper(s) took effect:\n         - ${diffs.join('\n         - ')}`);
        },
    },
    {
        Id: `${BUNDLE}.E10`,
        Name: 'E10 - delete attempts on the roll, poll book, audit trail and ballot box never remove a row, for any identity (system included)',
        Fn: async () => {
            const w = W();
            const diffs: string[] = [];
            for (const entity of ['Eligible Voters', 'Participations', 'Election Audit Events', 'Cast Ballots', 'Ballot Selections', 'Contest Running Tallies', 'Ballot Attributions']) {
                const full = VOTING_PREFIX + entity;
                const id = w.Targets.get(full);
                if (!id) {
                    if (entity !== 'Ballot Attributions') diffs.push(`${entity}: no row in the victim election to attack (setup gap)`);
                    continue;
                }
                const meta = MetaOf(full);
                for (const column of ALL_ENTITY_COLUMNS) {
                    await RawDelete(CredentialFor(column), meta.ClassName, id);
                    if (!(await RowExists(entity, id))) {
                        diffs.push(`${entity} row was DELETED by ${column}`);
                        break;
                    }
                }
            }
            Assert(diffs.length === 0, `${diffs.length} protected row(s) deleted:\n         - ${diffs.join('\n         - ')}`);
        },
    },
    {
        Id: `${BUNDLE}.E11`,
        Name: 'E11 - non-administrators cannot rewrite or delete the definition of a Draft election (name, contest, options, the election itself)',
        Fn: async () => {
            const w = W();
            const diffs: string[] = [];
            const electionClass = MetaOf(VOTING_PREFIX + 'Elections').ClassName;
            const contestClass = MetaOf(VOTING_PREFIX + 'Contests').ClassName;
            const contests = await RawRunView({ Kind: 'system' }, contestClass, VOTING_PREFIX + 'Contests', ['ID', 'Name'], { ExtraFilter: `ElectionID = '${w.D.ElectionID}'`, MaxRows: 5 });
            Assert(contests.Ran && contests.Rows.length > 0, 'the draft election has a contest');
            const contestID = String(contests.Rows[0].ID);
            for (const column of ['inspector', 'member', 'outsider', 'trustee', 'guest'] as const) {
                const cred = CredentialFor(column);
                const nameBefore = await ReadField('Elections', w.D.ElectionID, 'Name');
                await RawUpdate(cred, electionClass, w.D.ElectionID, { Name: `renamed-by-${column}` });
                const nameAfter = await ReadField('Elections', w.D.ElectionID, 'Name');
                if (nameBefore !== nameAfter) diffs.push(`Election.Name of a Draft election was CHANGED by ${column}`);
                const cBefore = await ReadField('Contests', contestID, 'Name');
                await RawUpdate(cred, contestClass, contestID, { Name: `renamed-by-${column}` });
                if ((await ReadField('Contests', contestID, 'Name')) !== cBefore) diffs.push(`Contest.Name of a Draft election was CHANGED by ${column}`);
                await RawDelete(cred, contestClass, contestID);
                if (!(await RowExists('Contests', contestID))) {
                    diffs.push(`a Contest of a Draft election was DELETED by ${column}`);
                    break;
                }
                await RawDelete(cred, electionClass, w.D.ElectionID);
                if (!(await RowExists('Elections', w.D.ElectionID))) {
                    diffs.push(`a Draft Election was DELETED by ${column}`);
                    break;
                }
            }
            Assert(diffs.length === 0, `${diffs.length} definition tamper(s) took effect:\n         - ${diffs.join('\n         - ')}`);
        },
    },
    ...(['system', 'admin', 'inspector', 'member', 'outsider', 'guest', 'trustee'] as const).map((column, i) => EntityColumnCheck(i + 1, column)),
    {
        Id: `${BUNDLE}.E08`,
        Name: 'E08 - the entity table covers exactly the voting entities the host serves',
        Fn: async () => {
            const served = W().Cast.System.Provider.Entities.filter((e) => e.Name.startsWith(VOTING_PREFIX)).map((e) => e.Name.slice(VOTING_PREFIX.length));
            const tabled = ENTITIES.map((e) => e.Name);
            for (const name of served) Assert(tabled.includes(name), `entity "${name}" has no row in the entity matrix`);
            for (const name of tabled) Assert(served.includes(name), `entity "${name}" is in the matrix but not served`);
        },
    },
];

for (const check of checks) IntegrationCheckRegistry.Instance.Register(check);

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (_ctx: IntegrationCheckContext) => {
        const cast = await WireCast.Create();
        const admin = await cast.As('admin');
        const A = await BuildWorldElection(cast, admin, { Voters: ['member1', 'member2', 'member3'], SlugPrefix: 'wire-xa' });
        const B = await BuildWorldElection(cast, admin, { Voters: ['member4'], SlugPrefix: 'wire-xb' });
        const V = await BuildWorldElection(cast, admin, { Voters: ['member1', 'member2'], SlugPrefix: 'wire-xv', ResultsTiming: 'Live', ResultsAudience: 'Eligible' });
        const D = await BuildWorldElection(cast, admin, { Voters: ['member1', 'member2'], SlugPrefix: 'wire-xd', DraftOnly: true });
        await AnchorDraftElection(cast, admin, D);
        const guestA = await GuestFor(A, 'member2');
        const guestB = await GuestFor(B, 'member4');
        // Token for raw GraphQL: re-mint one (the typed guest client does not expose its token).
        const voter = A.Voters.get('member1');
        if (!voter) throw new Error('member1 missing from election A');
        const rawSession = await GetGuestSession(A.Slug, { SourceKey: voter.SourceKey, Pin: voter.Pin });
        // The poll book / ballot box need rows to be probed against: one real vote in A (member2) and in V (member1).
        const castA = await CastWith(guestA, A.ElectionID, 0);
        if (!castA.Success) throw new Error(`setup cast in A failed: ${castA.Message}`);
        const castV = await CastWith(await GuestFor(V, 'member1'), V.ElectionID, 1);
        if (!castV.Success) throw new Error(`setup cast in V failed: ${castV.Message}`);
        // Selections rows only exist once the ballots are tallied; the victim election is closed and tallied for that.
        const closed = await admin.Call(new VotingCloseElectionOperation(), { ElectionID: V.ElectionID });
        if (!closed.Success || closed.Output?.Success !== true) throw new Error(`setup close of V failed: ${Describe(closed)}`);
        // The administrator persona is the intended tallier (see A12); setup falls back to the system user so that a
        // permission-model gap there is reported once, by A12, instead of taking down every probe that needs a tallied election.
        let tallied = await admin.Call(new VotingTallyOperation(), { ElectionID: V.ElectionID });
        if (!tallied.Success || tallied.Output?.Success !== true) tallied = await cast.System.Call(new VotingTallyOperation(), { ElectionID: V.ElectionID });
        if (!tallied.Success || tallied.Output?.Success !== true) throw new Error(`setup tally of V failed: ${Describe(tallied)}`);

        const targets = new Map<string, string>();
        const updateOnly = new Map<string, string>();
        for (const spec of ENTITIES) {
            const full = VOTING_PREFIX + spec.Name;
            world = { Cast: cast, Admin: admin, A, B, V, D, GuestA: guestA, GuestB: guestB, Targets: targets, UpdateOnlyTargets: updateOnly, GuestAToken: rawSession.Token };
            const filter = ScopeFilter(full, V.ElectionID);
            if (!filter) continue;
            const meta = MetaOf(full);
            const rows = await RawRunView({ Kind: 'system' }, meta.ClassName, full, ['ID'], { ExtraFilter: filter, MaxRows: 1 });
            if (rows.Ran && rows.Rows[0]) {
                targets.set(full, String(rows.Rows[0].ID));
                continue;
            }
            // The victim election has no row here (no anchor, nominations, proxies, trustees, certification, resolutions). The
            // UPDATE probe needs a REAL row, or MJ's deliberately ambiguous "Record not found or access denied" reads as a refusal
            // even for an identity that holds the grant; any existing row will do (the probe sends the key only, no values).
            // Kept apart from `targets` so no delete or tamper probe ever aims at a row of another election.
            const any = await RawRunView({ Kind: 'system' }, meta.ClassName, full, ['ID'], { MaxRows: 1, OrderBy: '__mj_CreatedAt DESC' });
            if (any.Ran && any.Rows[0]) updateOnly.set(full, String(any.Rows[0].ID));
        }
        world = { Cast: cast, Admin: admin, A, B, V, D, GuestA: guestA, GuestB: guestB, Targets: targets, UpdateOnlyTargets: updateOnly, GuestAToken: rawSession.Token };
    },
    Teardown: async (_ctx: IntegrationCheckContext) => {
        if (world) {
            for (const e of [world.A, world.B, world.V]) await CloseWorldElection(world.Admin, e);
        }
        world = undefined;
    },
});
