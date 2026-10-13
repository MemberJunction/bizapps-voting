/**
 * wire-lifecycle: full election lifecycles driven over GraphQL by real personas.
 *
 * Main election "L" (Secret, AfterClose, Voters audience, motion) carries WL1..WL17 in order; it is built by the admin
 * persona with Remote Operations only, voted by an MJ-session persona AND by guest edge sessions (POST /vote/session),
 * closed, tallied, certified by the inspector persona and read by every kind of viewer.
 *
 *   WL1   Draft: state, update, empty turnout
 *   WL2   Draft refusals: wrong state for tally/certify/close, not on the roll, non-admins are FORBIDDEN, PINs need Ready/Open
 *   WL3   roll freeze (count, SHA-256, repeat refusal), amend after freeze with a reason trail, cast before open refused
 *   WL4   edge before open: the ballot distribution is not public yet
 *   WL5   open: configuration locks, double-open refused, PINs issued, edge sign-in (bad PIN, bad key, durable lockout)
 *   WL6   voters cast: persona sessions + guest sessions; receipts well-formed and distinct; failed casts consume nothing
 *   WL7   one vote per voter: a second cast is refused with the reason, for persona and guest alike
 *   WL8   people not on the roll cannot cast (known person, unknown person)
 *   WL9   GetMyParticipation and VerifyReceipt
 *   WL10  turnout equals the casts, per channel; only admin/inspector may read it
 *   WL11  results are hidden while voting is open (even from the admin) with the reason
 *   WL12  a guest session is scoped to one election and to voter operations
 *   WL13  close: only admin; cast/open/PINs/sign-in refused afterwards; certify before tally refused; results hidden until tally
 *   WL14  tally: admin only; counts equal the hand-worked ballots; re-tally is stable
 *   WL15  results by viewer: admin and inspector see final results, eligible voters see them, outsiders do not
 *   WL16  certify: voters FORBIDDEN, the inspector signs; the certification record matches the roll and ballot set
 *   WL17  after certification everything is terminal
 *   WL18  revote election (Confidential): the revote supersedes; old receipt is no longer counted
 *   WL19  cancel: casts refused afterwards, tally/open refused, terminal
 *   WL20  paper ballot entered by the admin with a control number; the voter cannot then vote online
 *   WL21  CreateElection validation refusals carry their reasons
 *   WL22  OpenElection readiness refusals (trustee ceremony missing, verifiable provider missing)
 *   WL23  the audit trail records the lifecycle and never contains ballot content
 *   WL24  a plain (cache-allowed) RunView of the election sees each lifecycle transition (server cache is invalidated by the
 *         operation; the client's own MJ dedup-linger window is waited out, see docs/voting/known-limitations.md "Caching")
 *   WL25  nominations: open, nominate, decide (approve creates the ballot option), close, then vote for the nominee
 *   WL26  challenging a voter on the roll (reason required, admin only) removes them from the electorate
 *   WL27  AllowWriteIn on a contest spec gives the ballot exactly one write-in option; a write-in vote is cast and counted
 *   WL28  re-tally (the recount path): replaces the results (one final per contest), audited with the actor; refused once Certified
 *   WL29  no ballot distribution can be created for a Closed, Tallied, Certified or Cancelled election
 *   WL30  audit events of voter operations name the acting voter (nominations by a member persona)
 */
import { ProviderBase } from '@memberjunction/core';
import { Assert, AssertEqual, IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration/registry';
import {
    VotingAmendRollOperation,
    VotingCancelElectionOperation,
    VotingChallengeVoterOperation,
    VotingCloseNominationsOperation,
    VotingDecideNominationOperation,
    VotingOpenNominationsOperation,
    VotingSubmitNominationOperation,
    VotingCastBallotOperation,
    VotingCloseElectionOperation,
    VotingCreateElectionOperation,
    VotingEnterPaperBallotOperation,
    VotingFreezeRollOperation,
    VotingGetMyBallotOperation,
    VotingGetTurnoutOperation,
    VotingIssueControlNumbersOperation,
    VotingIssueSecondFactorPinsOperation,
    VotingOpenElectionOperation,
    VotingTallyOperation,
    VotingUpdateElectionOperation,
    type VotingCreateElectionInput,
} from '@mj-biz-apps/voting-entities';
import { LoadVotingWorld } from '../world/voting-world.js';
import { GetDistributionInfo, RequestGuestSession } from '../wire/guest-session.js';
import {
    AssertDeclined,
    AssertForbidden,
    CastAll,
    CreateDraftElection,
    CreateLiveElection,
    MotionSpec,
    Ok,
    PersonaVoter,
    ReadElectionRow,
    Tagged,
    WorldGuest,
    type LiveElection,
    type WireVoterSpec,
} from '../wire/wire-kit.js';
import { WireCast } from '../wire/wire-cast.js';
import type { WireClient } from '../wire/wire-client.js';

const BUNDLE = 'wire-lifecycle';
const RECEIPT = /^[0-9A-Z]{4}(-[0-9A-Z]{4}){4}$/;
const ELIGIBLE_VOTERS = 'MJ_BizApps_Voting: Eligible Voters';
const CERTIFICATIONS = 'MJ_BizApps_Voting: Election Certifications';
const AUDIT = 'MJ_BizApps_Voting: Election Audit Events';
const OPTIONS = 'MJ_BizApps_Voting: Contest Options';
const CONTEST_RESULTS = 'MJ_BizApps_Voting: Contest Results';

let cast: WireCast | undefined;
let admin: WireClient | undefined;
let L: LiveElection | undefined;
const created: LiveElection[] = [];
/** Receipts of the main election, by voter label. */
const receipts: Record<string, string> = {};
let frozenRollHash = '';
let revoteReceipt = '';

const C = (): WireCast => {
    if (!cast) throw new Error('wire-lifecycle setup did not run');
    return cast;
};
const A = (): WireClient => {
    if (!admin) throw new Error('wire-lifecycle setup did not run');
    return admin;
};
const El = (): LiveElection => {
    if (!L) throw new Error('wire-lifecycle setup did not run');
    return L;
};

const P = (): { member1: string; member2: string; member3: string; member4: string; trustee1: string; outsider: string; known: string } => ({
    member1: C().Record('member1').Email,
    member2: C().Record('member2').Email,
    member3: C().Record('member3').Email,
    member4: C().Record('member4').Email,
    trustee1: C().Record('trustee1').Email,
    outsider: C().Record('outsider').Email,
    known: C().Record('outsider-known').Email,
});

const W = (n: number): string => WorldGuest(n).Email;

/** The main election's roll: 4 personas + 4 world guests. */
function MainRoll(): WireVoterSpec[] {
    return [
        PersonaVoter(C(), 'member1', 0),
        PersonaVoter(C(), 'member2', 1),
        PersonaVoter(C(), 'member3', 2),
        PersonaVoter(C(), 'trustee1', 3),
        WorldGuest(19),
        WorldGuest(20),
        WorldGuest(21),
        WorldGuest(22),
    ];
}

async function Rows<T>(client: WireClient, entity: string, filter: string, fields: string[], orderBy?: string): Promise<T[]> {
    const res = await client.RunView<T>({ EntityName: entity, ExtraFilter: filter, Fields: fields, OrderBy: orderBy, ResultType: 'simple', BypassCache: true });
    if (!res.Success) throw new Error(`${entity} read failed: ${res.ErrorMessage}`);
    return res.Results;
}

const checks: NamedCheck[] = [
    {
        Id: `${BUNDLE}.WL1`,
        Name: 'WL1 - Draft: created by the admin, editable, no roll and no turnout yet',
        Fn: async () => {
            const row = await ReadElectionRow(A(), El().ElectionID);
            AssertEqual(row?.Status, 'Draft', 'status after CreateElection');
            AssertEqual(row?.RollFrozenAt, null, 'roll not frozen yet');
            AssertEqual(row?.SecrecyMode, 'Secret', 'secrecy as requested');
            const rename = Tagged('Wire lifecycle (renamed)');
            Ok('Voting.UpdateElection', await A().Call(new VotingUpdateElectionOperation(), { ElectionID: El().ElectionID, Name: rename, Description: 'edited while in Draft' }));
            const after = await Rows<{ Name: string; Description: string }>(A(), 'MJ_BizApps_Voting: Elections', `ID = '${El().ElectionID}'`, ['Name', 'Description']);
            AssertEqual(after[0].Name, rename, 'the rename is stored');
            AssertEqual(after[0].Description, 'edited while in Draft', 'the description is stored');
            const turnout = Ok('Voting.GetTurnout', await El().Turnout());
            AssertEqual(turnout.Eligible, 0, 'no roll rows before freeze');
            AssertEqual(turnout.Voted, 0, 'nobody voted');
            AssertEqual(El().Contests.length, 1, 'one contest');
            AssertEqual(El().Contest('Adopt the wire resolution').OptionIDByLabel.size, 2, 'Yes/No options');
        },
    },
    {
        Id: `${BUNDLE}.WL2`,
        Name: 'WL2 - Draft refusals: wrong state for tally/certify/close, not on the roll, non-admins FORBIDDEN, PINs need Ready/Open',
        Fn: async () => {
            const member1 = await C().As('member1');
            const outsider = await C().As('outsider');
            AssertDeclined(await member1.Call(new VotingGetMyBallotOperation(), { ElectionID: El().ElectionID }), 'not on the roll', 'member1 before the roll exists');
            AssertDeclined(await El().TallyAs(A()), 'only a Closed election can be tallied', 'admin tally of a Draft');
            AssertDeclined(await El().CertifyAs(A()), 'only a Tallied election can be certified', 'admin certify of a Draft');
            AssertDeclined(await A().Call(new VotingCloseElectionOperation(), { ElectionID: El().ElectionID }), 'cannot be closed', 'admin close of a Draft');
            AssertDeclined(await A().Call(new VotingIssueSecondFactorPinsOperation(), { ElectionID: El().ElectionID }), 'Ready or Open', 'PINs for a Draft');

            AssertForbidden(await El().TallyAs(member1), 'Voting.Tally', 'member1');
            AssertForbidden(await member1.Call(new VotingUpdateElectionOperation(), { ElectionID: El().ElectionID, Name: 'hijack' }), 'Voting.UpdateElection', 'member1');
            AssertForbidden(await member1.Call(new VotingFreezeRollOperation(), { ElectionID: El().ElectionID }), 'Voting.FreezeRoll', 'member1');
            AssertForbidden(await member1.Call(new VotingOpenElectionOperation(), { ElectionID: El().ElectionID }), 'Voting.OpenElection', 'member1');
            AssertForbidden(await outsider.Call(new VotingCreateElectionOperation(), { ElectionTypeCode: 'motion', Name: 'x', EligibilitySource: { Code: 'csv', Settings: { Rows: [] } }, Contests: [MotionSpec('x')] }), 'Voting.CreateElection', 'outsider');
            AssertForbidden(await El().CertifyAs(outsider), 'Voting.Certify', 'outsider');
            // None of the refused calls changed anything.
            AssertEqual((await ReadElectionRow(A(), El().ElectionID))?.Status, 'Draft', 'still Draft after the refusals');
        },
    },
    {
        Id: `${BUNDLE}.WL3`,
        Name: 'WL3 - freeze the roll (count, SHA-256, repeat refused), amend it with a reason trail, cast before open refused',
        Fn: async () => {
            const frozen = Ok('Voting.FreezeRoll', await A().Call(new VotingFreezeRollOperation(), { ElectionID: El().ElectionID }));
            AssertEqual(frozen.VoterCount, 8, 'eight voters on the roll');
            Assert(/^[0-9a-f]{64}$/i.test(frozen.RollHash ?? ''), `roll hash is a SHA-256 hex digest (got ${frozen.RollHash})`);
            frozenRollHash = frozen.RollHash ?? '';
            const row = await ReadElectionRow(A(), El().ElectionID);
            Assert(row?.RollFrozenAt !== null, 'RollFrozenAt is set');
            AssertEqual(row?.RollHash, frozenRollHash, 'the stored hash is the one returned');
            AssertDeclined(await A().Call(new VotingFreezeRollOperation(), { ElectionID: El().ElectionID }), 'already frozen', 'second FreezeRoll');

            // amend after freeze: add member4, then remove them again; removal needs a reason
            const member4Person = C().Record('member4').PersonID as string;
            const added = Ok('Voting.AmendRoll (add)', await A().Call(new VotingAmendRollOperation(), { ElectionID: El().ElectionID, Add: [{ PersonID: member4Person, SourceKey: 'late-m4', Weight: 1 }] }));
            AssertEqual(added.Added, 1, 'one voter added');
            AssertEqual(Ok('turnout', await El().Turnout()).Eligible, 9, 'nine eligible after the addition');
            const m4 = (await Rows<{ ID: string }>(A(), ELIGIBLE_VOTERS, `ElectionID = '${El().ElectionID}' AND SourceKey = 'late-m4'`, ['ID']))[0];
            Assert(!!m4, 'the added voter has a roll row');
            AssertDeclined(await A().Call(new VotingAmendRollOperation(), { ElectionID: El().ElectionID, Remove: [{ EligibleVoterID: m4.ID, Reason: '  ' }] }), 'reason', 'removal without a reason');
            const removed = Ok('Voting.AmendRoll (remove)', await A().Call(new VotingAmendRollOperation(), { ElectionID: El().ElectionID, Remove: [{ EligibleVoterID: m4.ID, Reason: 'wire test: late addition withdrawn' }] }));
            AssertEqual(removed.Removed, 1, 'one voter removed');
            AssertEqual(Ok('turnout', await El().Turnout()).Eligible, 8, 'eight eligible again');
            const kept = await Rows<{ Status: string }>(A(), ELIGIBLE_VOTERS, `ID = '${m4.ID}'`, ['Status']);
            AssertEqual(kept[0]?.Status, 'Removed', 'the removed voter stays on file as Removed (audit trail)');
            AssertDeclined(await A().Call(new VotingAmendRollOperation(), { ElectionID: El().ElectionID }), 'no additions or removals', 'empty amendment');

            // the roll exists but voting has not opened
            const member1 = await C().As('member1');
            const ballot = Ok('GetMyBallot before open', await member1.Call(new VotingGetMyBallotOperation(), { ElectionID: El().ElectionID }));
            AssertEqual(ballot.HasVoted, false, 'not voted');
            const contest = El().Contests[0];
            const attempt = await member1.Call(new VotingCastBallotOperation(), {
                ElectionID: El().ElectionID,
                BallotStyleHash: ballot.Style?.Hash ?? '',
                Submission: { Contests: [{ ContestID: contest.ContestID, Selections: [{ OptionID: contest.OptionIDByLabel.get('Yes') as string }] }] },
            });
            AssertDeclined(attempt, 'not open for voting', 'cast before the election opens');
        },
    },
    {
        Id: `${BUNDLE}.WL4`,
        Name: 'WL4 - the ballot distribution: public info only once it exists; the edge refuses a sign-in before the election opens',
        Fn: async () => {
            const pinsEarly = await A().Call(new VotingIssueSecondFactorPinsOperation(), { ElectionID: El().ElectionID });
            // PINs are issued once the election is Ready or Open: a frozen Draft election is still a Draft.
            AssertDeclined(pinsEarly, 'Ready or Open', 'PINs before open');
            await El().Distribute();
            const refused = await RequestGuestSession(El().Slug, { SourceKey: 'wl-w19', Pin: '12345678' });
            Assert(refused.Kind === 'refused', 'no session before the election is open');
            if (refused.Kind === 'refused') {
                if (process.env.WIRE_TRACE) console.log(`      [trace] edge pre-open: ${refused.Status} ${refused.Code}: ${refused.ErrorMessage}`);
                AssertEqual(refused.Status, 404, 'a ballot that is not open is simply not public');
                AssertEqual(refused.Code, 'not_found', 'edge code');
                AssertEqual(refused.ErrorMessage, 'This ballot is not available.', 'edge message leaks nothing about the election');
                const info = await GetDistributionInfo(El().Slug);
                AssertEqual(info, null, 'the public info endpoint also hides a ballot that is not open');
            }
        },
    },
    {
        Id: `${BUNDLE}.WL5`,
        Name: 'WL5 - open: configuration locks, double-open refused, PINs issued, edge sign-in refuses bad PINs and locks a guessed credential',
        Fn: async () => {
            await El().Open();
            AssertEqual((await ReadElectionRow(A(), El().ElectionID))?.Status, 'Open', 'status after OpenElection');
            AssertDeclined(await A().Call(new VotingOpenElectionOperation(), { ElectionID: El().ElectionID }), 'cannot be opened', 'second OpenElection');
            const locked = await A().Call(new VotingUpdateElectionOperation(), { ElectionID: El().ElectionID, SecrecyMode: 'Open' });
            Assert(!locked.Success || locked.Output?.Success === false, 'changing the secrecy of an Open election must be refused');
            AssertEqual((await ReadElectionRow(A(), El().ElectionID))?.SecrecyMode, 'Secret', 'secrecy unchanged');
            AssertDeclined(await A().Call(new VotingFreezeRollOperation(), { ElectionID: El().ElectionID }), 'already frozen', 'FreezeRoll on an Open election');

            await El().IssuePins();
            for (const v of El().Voters) Assert(!!v.Pin && /^\d{8}$/.test(v.Pin), `${v.Email} received an 8-digit PIN (shape only)`);
            AssertEqual(new Set(El().Voters.map((v) => v.Pin)).size, 8, 'PINs are distinct');

            // bad PIN, unknown roster key, unknown slug
            const w19 = El().Voter(W(19));
            const bad = await RequestGuestSession(El().Slug, { SourceKey: w19.SourceKey, Pin: w19.Pin === '00000000' ? '11111111' : '00000000' });
            Assert(bad.Kind === 'refused', 'a wrong PIN yields no session');
            if (bad.Kind === 'refused') {
                AssertEqual(bad.Status, 401, 'status for a failed sign-in');
                AssertEqual(bad.Code, 'sign_in_failed', 'edge code for a failed sign-in');
            }
            const unknownKey = await RequestGuestSession(El().Slug, { SourceKey: 'nobody-here', Pin: '00000000' });
            Assert(unknownKey.Kind === 'refused' && unknownKey.Code === 'sign_in_failed', 'an unknown roster key is indistinguishable from a wrong PIN');
            const unknownSlug = await RequestGuestSession('no-such-ballot-slug', { SourceKey: w19.SourceKey, Pin: w19.Pin as string });
            Assert(unknownSlug.Kind === 'refused', 'an unknown ballot slug yields no session');
            if (unknownSlug.Kind === 'refused') AssertEqual(unknownSlug.Status, 404, 'status for an unknown slug');

            // durable lockout on a guessed credential (w22 never votes in this election): 5 failures, then even the right PIN is refused
            const target = El().Voter(W(22));
            for (let i = 0; i < 5; i++) {
                const r = await RequestGuestSession(El().Slug, { SourceKey: target.SourceKey, Pin: '99999999' });
                Assert(r.Kind === 'refused', `guess ${i + 1} refused`);
            }
            const lockedOut = await RequestGuestSession(El().Slug, { SourceKey: target.SourceKey, Pin: target.Pin as string });
            Assert(lockedOut.Kind === 'refused', 'after five failures the correct PIN is refused too (lockout)');
        },
    },
    {
        Id: `${BUNDLE}.WL6`,
        Name: 'WL6 - members and guests cast; receipts are well-formed and distinct; failed casts consume nothing',
        Fn: async () => {
            // Malformed attempts by trustee1 first: none may consume the vote.
            const t1 = await El().Session(P().trustee1);
            const style = Ok('GetMyBallot (trustee1)', await t1.GetBallot()).Style;
            Assert(!!style, 'trustee1 sees the ballot');
            const contest = El().Contests[0];
            const yes = contest.OptionIDByLabel.get('Yes') as string;
            const no = contest.OptionIDByLabel.get('No') as string;
            const send = async (hash: string, submission: { Contests: Array<{ ContestID: string; Abstain?: boolean; Selections: Array<{ OptionID: string }> }> }) =>
                t1.Client.Call(new VotingCastBallotOperation(), { ElectionID: El().ElectionID, BallotStyleHash: hash, Submission: submission });
            AssertDeclined(await send('0'.repeat(64), { Contests: [{ ContestID: contest.ContestID, Selections: [{ OptionID: yes }] }] }), 'ballot changed', 'stale ballot hash');
            AssertDeclined(await send(style!.Hash, { Contests: [{ ContestID: contest.ContestID, Selections: [{ OptionID: yes }, { OptionID: no }] }] }), 'TooManySelections', 'two selections in a single-choice contest');
            AssertDeclined(await send(style!.Hash, { Contests: [{ ContestID: contest.ContestID, Selections: [{ OptionID: '00000000-0000-4000-8000-000000000000' }] }] }), 'UnknownOption', 'an option that is not on the ballot');
            AssertDeclined(await send(style!.Hash, { Contests: [{ ContestID: '00000000-0000-4000-8000-000000000000', Selections: [{ OptionID: yes }] }] }), 'UnknownContest', 'a contest that is not on the ballot');
            AssertDeclined(await send(style!.Hash, { Contests: [{ ContestID: contest.ContestID, Abstain: true, Selections: [{ OptionID: yes }] }] }), 'AbstainWithSelections', 'abstain with a selection');
            const stillOpen = Ok('GetMyBallot (trustee1) after failures', await t1.GetBallot());
            AssertEqual(stillOpen.HasVoted, false, 'no malformed attempt consumed trustee1\'s vote');

            // The real ballots: 3 Yes, 1 No, 1 abstain.
            const plan = (pick: 'Yes' | 'No' | 'abstain') => ({ 'Adopt the wire resolution': pick === 'abstain' ? ('abstain' as const) : [pick] });
            const order: Array<[string, string, 'Yes' | 'No' | 'abstain']> = [
                ['member1', P().member1, 'Yes'],
                ['member2', P().member2, 'Yes'],
                ['w19', W(19), 'Yes'],
                ['w20', W(20), 'No'],
                ['w21', W(21), 'abstain'],
            ];
            for (const [label, email, pick] of order) {
                const voter = await El().Session(email);
                const ballot = Ok(`GetMyBallot (${label})`, await voter.GetBallot());
                AssertEqual(ballot.HasVoted, false, `${label} has not voted yet`);
                AssertEqual(ballot.Style?.Contests.length, 1, `${label} sees one contest`);
                AssertEqual(voter.Kind, label.startsWith('w') ? 'guest' : 'persona', `${label} session kind`);
                receipts[label] = await voter.MustCast(plan(pick));
                Assert(RECEIPT.test(receipts[label]), `${label} receipt looks like XXXX-XXXX-XXXX-XXXX-XXXX (got ${receipts[label]})`);
            }
            AssertEqual(new Set(Object.values(receipts)).size, 5, 'five distinct receipts');
        },
    },
    {
        Id: `${BUNDLE}.WL7`,
        Name: 'WL7 - one vote per voter: a second cast is refused ("already voted") for a persona and for a guest',
        Fn: async () => {
            for (const [label, email] of [
                ['member1', P().member1],
                ['w19', W(19)],
            ] as const) {
                const voter = await El().Session(email);
                const again = await voter.CastPlan({ 'Adopt the wire resolution': ['No'] });
                AssertDeclined(again.Result, 'already voted', `${label} second cast`);
                const part = Ok(`participation ${label}`, await voter.Participation());
                AssertEqual(part.HasVoted, true, `${label} still counted as voted`);
            }
            // the refused second casts did not add a ballot
            AssertEqual(Ok('turnout', await El().Turnout()).Voted, 5, 'turnout still five');
        },
    },
    {
        Id: `${BUNDLE}.WL8`,
        Name: 'WL8 - people who are not on the roll cannot cast (a known Person, a user with no Person, a removed voter)',
        Fn: async () => {
            const contest = El().Contests[0];
            const submission = { Contests: [{ ContestID: contest.ContestID, Selections: [{ OptionID: contest.OptionIDByLabel.get('Yes') as string }] }] };
            const hash = Ok('hash', await (await El().Session(P().member1)).GetBallot()).Style?.Hash ?? '';
            for (const key of ['outsider-known', 'outsider', 'member4'] as const) {
                const client = await C().As(key);
                AssertDeclined(await client.Call(new VotingGetMyBallotOperation(), { ElectionID: El().ElectionID }), 'not on the roll', `${key} GetMyBallot`);
                AssertDeclined(await client.Call(new VotingCastBallotOperation(), { ElectionID: El().ElectionID, BallotStyleHash: hash, Submission: submission }), 'not on the roll', `${key} CastBallot`);
            }
            AssertEqual(Ok('turnout', await El().Turnout()).Voted, 5, 'nothing was recorded for non-roll callers');
        },
    },
    {
        Id: `${BUNDLE}.WL9`,
        Name: 'WL9 - GetMyParticipation and VerifyReceipt agree with the casts',
        Fn: async () => {
            const voted: Array<[string, string]> = [
                ['member1', P().member1],
                ['member2', P().member2],
                ['w19', W(19)],
                ['w20', W(20)],
                ['w21', W(21)],
            ];
            for (const [label, email] of voted) {
                const voter = await El().Session(email);
                const part = Ok(`participation ${label}`, await voter.Participation());
                AssertEqual(part.HasVoted, true, `${label} HasVoted`);
                AssertEqual(part.Channel, 'Online', `${label} channel`);
                const ok = Ok(`verify ${label}`, await voter.VerifyReceipt(receipts[label]));
                AssertEqual(ok.Found, true, `${label} receipt found`);
                AssertEqual(ok.Counted, true, `${label} receipt counted`);
                // a lower-case, unhyphenated rendering of the same receipt normalizes to the same ballot
                const sloppy = Ok(`verify ${label} (sloppy)`, await voter.VerifyReceipt(receipts[label].toLowerCase().replace(/-/g, '')));
                AssertEqual(sloppy.Found, true, `${label} receipt found after normalization`);
            }
            const trustee = await El().Session(P().trustee1);
            AssertEqual(Ok('participation trustee1', await trustee.Participation()).HasVoted, false, 'trustee1 has not voted');
            const member1 = await El().Session(P().member1);
            const bogus = Ok('verify bogus', await member1.VerifyReceipt('ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ'));
            AssertEqual(bogus.Found, false, 'an invented receipt is not found');
            const myBallot = Ok('GetMyBallot member1', await member1.GetBallot());
            AssertEqual(myBallot.HasVoted, true, 'GetMyBallot reports the vote');
            AssertEqual(myBallot.CanRevote, false, 'a Secret election never allows a revote');
        },
    },
    {
        Id: `${BUNDLE}.WL10`,
        Name: 'WL10 - turnout equals the casts; only the admin and the inspector may read it',
        Fn: async () => {
            const t = Ok('turnout', await El().Turnout());
            AssertEqual(t.Eligible, 8, 'eligible');
            AssertEqual(t.Voted, 5, 'voted equals the five accepted casts');
            Assert(Math.abs((t.TurnoutPercent ?? 0) - 62.5) < 0.01, `turnout percent 5/8 = 62.5 (got ${t.TurnoutPercent})`);
            AssertEqual(t.ByChannel?.Online, 5, 'all five casts were online');
            Assert(t.QuorumMet !== false, 'no quorum configured: the quorum is not reported as unmet');
            const inspector = await C().As('inspector');
            AssertEqual(Ok('turnout inspector', await El().Turnout(inspector)).Voted, 5, 'inspector reads the same number');
            for (const key of ['member1', 'member3', 'outsider', 'outsider-known'] as const) {
                AssertForbidden(await El().Turnout(await C().As(key)), 'Voting.GetTurnout', key);
            }
            const guest = await El().Session(W(19));
            AssertForbidden(await El().Turnout(guest.Client), 'Voting.GetTurnout', 'guest session');
        },
    },
    {
        Id: `${BUNDLE}.WL11`,
        Name: 'WL11 - results are hidden while voting is open, even from the admin, with the reason',
        Fn: async () => {
            for (const key of ['admin', 'inspector', 'member1', 'outsider'] as const) {
                const res = await El().ResultsFor(await C().As(key));
                Assert(res.Success && res.Output?.Success === true, `${key}: GetResults itself answers (${res.ResultCode} ${res.ErrorMessage})`);
                AssertEqual(res.Output?.Visible, false, `${key}: results not visible while Open`);
                Assert((res.Output?.Reason ?? '').toLowerCase().includes('until after voting closes'), `${key}: reason (got "${res.Output?.Reason}")`);
                AssertEqual((res.Output?.Contests ?? []).length, 0, `${key}: no contest data leaks`);
            }
            const guest = await El().Session(W(19));
            const g = await guest.Results();
            AssertEqual(g.Output?.Visible, false, 'a guest voter also sees nothing yet');
        },
    },
    {
        Id: `${BUNDLE}.WL12`,
        Name: 'WL12 - a guest ballot session is scoped to its own election and to voter operations',
        Fn: async () => {
            const other = await CreateLiveElection(C(), A(), {
                TypeCode: 'motion',
                Name: Tagged('Wire scope probe'),
                Voters: [WorldGuest(30), WorldGuest(31)],
                Contests: [MotionSpec('Scope probe')],
                Extra: { SecrecyMode: 'Secret' },
            });
            created.push(other);
            const guest = await El().Session(W(19));
            AssertForbidden(await guest.Client.Call(new VotingGetMyBallotOperation(), { ElectionID: other.ElectionID }), 'Voting.GetMyBallot', 'guest of another election');
            AssertForbidden(await other.ResultsFor(guest.Client), 'Voting.GetResults', 'guest of another election');
            AssertForbidden(await guest.Client.Call(new VotingCastBallotOperation(), { ElectionID: other.ElectionID, BallotStyleHash: 'x', Submission: { Contests: [] } }), 'Voting.CastBallot', 'guest of another election');
            for (const [op, call] of [
                ['Voting.Tally', () => guest.Client.Call(new VotingTallyOperation(), { ElectionID: El().ElectionID })],
                ['Voting.OpenElection', () => guest.Client.Call(new VotingOpenElectionOperation(), { ElectionID: El().ElectionID })],
                ['Voting.CloseElection', () => guest.Client.Call(new VotingCloseElectionOperation(), { ElectionID: El().ElectionID })],
                ['Voting.CancelElection', () => guest.Client.Call(new VotingCancelElectionOperation(), { ElectionID: El().ElectionID, Reason: 'x' })],
                ['Voting.GetTurnout', () => guest.Client.Call(new VotingGetTurnoutOperation(), { ElectionID: El().ElectionID })],
            ] as const) {
                const r = await call();
                Assert(!r.Success, `a guest session must not run ${op}`);
            }
            AssertEqual((await ReadElectionRow(A(), El().ElectionID))?.Status, 'Open', 'the main election is untouched');
        },
    },
    {
        Id: `${BUNDLE}.WL13`,
        Name: 'WL13 - close: only the admin; afterwards cast/open/PINs/sign-in are refused; certify before tally refused; results wait for the tally',
        Fn: async () => {
            AssertForbidden(await (await C().As('member1')).Call(new VotingCloseElectionOperation(), { ElectionID: El().ElectionID }), 'Voting.CloseElection', 'member1');
            AssertForbidden(await (await C().As('inspector')).Call(new VotingCloseElectionOperation(), { ElectionID: El().ElectionID }), 'Voting.CloseElection', 'inspector');
            await El().Close();
            AssertEqual((await ReadElectionRow(A(), El().ElectionID))?.Status, 'Closed', 'status after close');

            const t1 = await El().Session(P().trustee1);
            const late = await t1.CastPlan({ 'Adopt the wire resolution': ['Yes'] });
            AssertDeclined(late.Result, 'not open for voting', 'cast after close');
            AssertDeclined(await A().Call(new VotingCloseElectionOperation(), { ElectionID: El().ElectionID }), 'cannot be closed', 'second close');
            AssertDeclined(await A().Call(new VotingOpenElectionOperation(), { ElectionID: El().ElectionID }), 'cannot be opened', 'reopen after close');
            AssertDeclined(await A().Call(new VotingIssueSecondFactorPinsOperation(), { ElectionID: El().ElectionID }), 'Ready or Open', 'PINs after close');
            AssertDeclined(await El().CertifyAs(A()), 'only a Tallied election can be certified', 'certify before tally');
            const edge = await RequestGuestSession(El().Slug, { SourceKey: El().Voter(W(21)).SourceKey, Pin: El().Voter(W(21)).Pin as string });
            Assert(edge.Kind === 'refused', 'the edge no longer mints sessions once the election is closed');

            for (const key of ['admin', 'inspector', 'member1'] as const) {
                const res = await El().ResultsFor(await C().As(key));
                AssertEqual(res.Output?.Visible, false, `${key}: nothing before the tally`);
                Assert((res.Output?.Reason ?? '').toLowerCase().includes('after tallying'), `${key}: reason mentions the tally (got "${res.Output?.Reason}")`);
            }
            AssertEqual(Ok('turnout', await El().Turnout()).Voted, 5, 'turnout is frozen at five');
        },
    },
    {
        Id: `${BUNDLE}.WL14`,
        Name: 'WL14 - tally: admin only; 3 Yes, 1 No, 1 abstention => Passed; a re-tally gives the same result',
        Fn: async () => {
            for (const key of ['member1', 'inspector', 'outsider'] as const) {
                AssertForbidden(await El().TallyAs(await C().As(key)), 'Voting.Tally', key);
            }
            const first = Ok('Voting.Tally', await El().TallyAs(A(), 'wire-lifecycle-seed'));
            AssertEqual(first.Status, 'Tallied', 'status after tally');
            AssertEqual((await ReadElectionRow(A(), El().ElectionID))?.Status, 'Tallied', 'stored status');
            const motion = El().LabelAll(first.Contests).get('Adopt the wire resolution');
            Assert(!!motion, 'the motion has a result');
            AssertEqual(motion!.Outcome, 'Passed', 'outcome');
            AssertEqual(motion!.VotesCast, 4, 'votes cast excludes the abstention');
            AssertEqual(motion!.Abstentions, 1, 'abstentions');
            AssertEqual(motion!.Options['Yes'].Votes, 3, 'Yes');
            AssertEqual(motion!.Options['No'].Votes, 1, 'No');
            AssertEqual(motion!.TieBroken, false, 'no tie');
            const second = Ok('Voting.Tally (again)', await El().TallyAs(A(), 'wire-lifecycle-seed'));
            const again = El().LabelAll(second.Contests).get('Adopt the wire resolution');
            AssertEqual(JSON.stringify(again?.Options), JSON.stringify(motion!.Options), 're-tally with the same seed is identical');
        },
    },
    {
        Id: `${BUNDLE}.WL15`,
        Name: 'WL15 - results by viewer: admin and inspector always, eligible voters (voted or not, member or guest) yes, outsiders no',
        Fn: async () => {
            const expectVisible = async (label: string, client: WireClient): Promise<void> => {
                const res = await El().ResultsFor(client);
                Assert(res.Success && res.Output?.Success === true, `${label}: GetResults answers`);
                AssertEqual(res.Output?.Visible, true, `${label}: visible (reason: ${res.Output?.Reason})`);
                AssertEqual(res.Output?.IsFinal, true, `${label}: final`);
                const motion = El().LabelAll(res.Output?.Contests).get('Adopt the wire resolution');
                AssertEqual(motion?.Outcome, 'Passed', `${label}: sees the outcome`);
                AssertEqual(motion?.Options['Yes'].Votes, 3, `${label}: sees the Yes count`);
            };
            await expectVisible('admin', A());
            await expectVisible('inspector', await C().As('inspector'));
            await expectVisible('member1 (voted)', await C().As('member1'));
            await expectVisible('trustee1 (eligible, did not vote)', await C().As('trustee1'));
            await expectVisible('guest w19', (await El().Session(W(19))).Client);
            for (const key of ['outsider', 'outsider-known', 'member4'] as const) {
                const res = await El().ResultsFor(await C().As(key));
                Assert(res.Success && res.Output?.Success === true, `${key}: GetResults answers without erroring`);
                AssertEqual(res.Output?.Visible, false, `${key}: not visible`);
                Assert((res.Output?.Reason ?? '').toLowerCase().includes('only eligible voters'), `${key}: reason (got "${res.Output?.Reason}")`);
                AssertEqual((res.Output?.Contests ?? []).length, 0, `${key}: no contest data leaks`);
            }
        },
    },
    {
        Id: `${BUNDLE}.WL16`,
        Name: 'WL16 - certify: voters are FORBIDDEN, the inspector signs; the certification matches the roll and the ballot set',
        Fn: async () => {
            AssertForbidden(await El().CertifyAs(await C().As('member1')), 'Voting.Certify', 'member1');
            AssertForbidden(await El().CertifyAs((await El().Session(W(19))).Client), 'Voting.Certify', 'guest voter');
            const inspector = await C().As('inspector');
            const out = Ok('Voting.Certify', await El().CertifyAs(inspector, 'wire lifecycle certification'));
            AssertEqual(out.Status, 'Certified', 'certification status');
            Assert(!!out.CertificationID, 'a certification id is returned');
            AssertEqual((await ReadElectionRow(A(), El().ElectionID))?.Status, 'Certified', 'election status');
            const rows = await Rows<{ Status: string; RollHash: string; BallotSetHash: string; ResultsTimingDisclosure: string; Notes: string | null }>(A(), CERTIFICATIONS, `ElectionID = '${El().ElectionID}'`, ['Status', 'RollHash', 'BallotSetHash', 'ResultsTimingDisclosure', 'Notes']);
            AssertEqual(rows.length, 1, 'exactly one certification record');
            AssertEqual(rows[0].Status, 'Certified', 'record status');
            AssertEqual(rows[0].RollHash, frozenRollHash, 'the certification pins the frozen roll hash');
            Assert(/^[0-9a-f]{64}$/i.test(rows[0].BallotSetHash), `ballot-set hash is a SHA-256 (got ${rows[0].BallotSetHash})`);
            Assert(rows[0].ResultsTimingDisclosure.length > 10, 'the results-timing disclosure is recorded');
            AssertEqual(rows[0].Notes, 'wire lifecycle certification', 'notes recorded');
        },
    },
    {
        Id: `${BUNDLE}.WL17`,
        Name: 'WL17 - after certification everything is terminal; the result stays visible',
        Fn: async () => {
            AssertDeclined(await El().CertifyAs(await C().As('inspector')), 'only a Tallied election can be certified', 'second certify');
            AssertDeclined(await El().TallyAs(A()), 'results are final', 're-tally of a certified election');
            AssertDeclined(await A().Call(new VotingCancelElectionOperation(), { ElectionID: El().ElectionID, Reason: 'too late' }), 'cannot be cancelled', 'cancel after certification');
            AssertDeclined(await A().Call(new VotingOpenElectionOperation(), { ElectionID: El().ElectionID }), 'cannot be opened', 'reopen after certification');
            AssertDeclined(await A().Call(new VotingCloseElectionOperation(), { ElectionID: El().ElectionID }), 'cannot be closed', 'close after certification');
            const edit = await A().Call(new VotingUpdateElectionOperation(), { ElectionID: El().ElectionID, Name: 'rewritten history' });
            Assert(!edit.Success || edit.Output?.Success === false, 'a certified election cannot be edited');
            const res = await El().ResultsFor(await C().As('member2'));
            AssertEqual(res.Output?.Visible, true, 'member2 still sees the certified result');
            AssertEqual(El().LabelAll(res.Output?.Contests).get('Adopt the wire resolution')?.Outcome, 'Passed', 'outcome unchanged');
        },
    },
    {
        Id: `${BUNDLE}.WL18`,
        Name: 'WL18 - Confidential election: a revote supersedes the first ballot; the old receipt is found but no longer counted',
        Fn: async () => {
            const R = await CreateLiveElection(C(), A(), {
                TypeCode: 'motion',
                Name: Tagged('Wire revote'),
                Voters: [PersonaVoter(C(), 'member1', 0), PersonaVoter(C(), 'member2', 1), WorldGuest(23)],
                Contests: [MotionSpec('Revote motion')],
                Extra: { SecrecyMode: 'Confidential' },
            });
            created.push(R);
            const m1 = await R.Session(P().member1);
            const m2 = await R.Session(P().member2);
            const first = await m1.MustCast({ 'Revote motion': ['Yes'] });
            const state = Ok('GetMyBallot after first cast', await m1.GetBallot());
            AssertEqual(state.HasVoted, true, 'voted');
            AssertEqual(state.CanRevote, true, 'a Confidential election allows a revote');
            AssertEqual(state.ReceiptCode, first, 'the voter can read their own receipt back');
            const second = await m1.MustCast({ 'Revote motion': ['No'] });
            Assert(second !== first, 'the revote has a new receipt');
            revoteReceipt = first;
            const oldVerdict = Ok('verify old', await m1.VerifyReceipt(first));
            AssertEqual(oldVerdict.Found, true, 'the first receipt is still on file');
            AssertEqual(oldVerdict.Counted, false, 'the first ballot is superseded');
            AssertEqual(Ok('verify new', await m1.VerifyReceipt(second)).Counted, true, 'the second ballot counts');
            await m2.MustCast({ 'Revote motion': ['Yes'] });
            AssertEqual(Ok('turnout', await R.Turnout()).Voted, 2, 'two voters, not three ballots');
            const motion = (await R.CloseAndTally('revote-seed')).find((c) => c.Name === 'Revote motion');
            AssertEqual(motion?.Options['Yes'].Votes, 1, 'Yes (member2 only)');
            AssertEqual(motion?.Options['No'].Votes, 1, 'No (member1 revoted)');
            AssertEqual(motion?.Outcome, 'Failed', 'a one-one split does not pass a Majority motion');
            // a receipt from one election is meaningless in another
            const crossCheck = Ok('verify cross-election', await (await El().Session(P().member1)).VerifyReceipt(revoteReceipt));
            AssertEqual(crossCheck.Found, false, 'a receipt from another election is not found here');
        },
    },
    {
        Id: `${BUNDLE}.WL19`,
        Name: 'WL19 - cancel: casts refused afterwards, tally and reopen refused, terminal',
        Fn: async () => {
            const X = await CreateLiveElection(C(), A(), {
                TypeCode: 'motion',
                Name: Tagged('Wire cancel'),
                Voters: [PersonaVoter(C(), 'member1', 0), PersonaVoter(C(), 'member2', 1)],
                Contests: [MotionSpec('Cancelled motion')],
                Extra: { SecrecyMode: 'Secret' },
            });
            created.push(X);
            const m1 = await X.Session(P().member1);
            await m1.MustCast({ 'Cancelled motion': ['Yes'] });
            AssertDeclined(await A().Call(new VotingCancelElectionOperation(), { ElectionID: X.ElectionID, Reason: '' }), 'Reason', 'cancel without a reason');
            AssertForbidden(await (await C().As('member1')).Call(new VotingCancelElectionOperation(), { ElectionID: X.ElectionID, Reason: 'x' }), 'Voting.CancelElection', 'member1');
            const done = Ok('Voting.CancelElection', await A().Call(new VotingCancelElectionOperation(), { ElectionID: X.ElectionID, Reason: 'wire test: cancelled mid-vote' }));
            AssertEqual(done.Status, 'Cancelled', 'status');
            AssertEqual((await ReadElectionRow(A(), X.ElectionID))?.Status, 'Cancelled', 'stored status');
            const m2 = await X.Session(P().member2);
            AssertDeclined((await m2.CastPlan({ 'Cancelled motion': ['Yes'] })).Result, 'not open for voting', 'cast after cancellation');
            AssertDeclined(await X.TallyAs(A()), 'only a Closed election can be tallied', 'tally of a cancelled election');
            AssertDeclined(await A().Call(new VotingOpenElectionOperation(), { ElectionID: X.ElectionID }), 'cannot be opened', 'reopen a cancelled election');
            AssertDeclined(await A().Call(new VotingCancelElectionOperation(), { ElectionID: X.ElectionID, Reason: 'again' }), 'cannot be cancelled', 'cancel twice');
        },
    },
    {
        Id: `${BUNDLE}.WL20`,
        Name: 'WL20 - paper ballot: the admin enters it against a control number; turnout counts the Paper channel; the voter cannot vote online again',
        Fn: async () => {
            const Pp = await CreateLiveElection(C(), A(), {
                TypeCode: 'motion',
                Name: Tagged('Wire paper'),
                Voters: [PersonaVoter(C(), 'member1', 0), PersonaVoter(C(), 'member2', 1), PersonaVoter(C(), 'member3', 2)],
                Contests: [MotionSpec('Paper motion')],
                Extra: { SecrecyMode: 'Secret' },
            });
            created.push(Pp);
            const target = Pp.Voter(P().member3);
            const issued = Ok('Voting.IssueControlNumbers', await A().Call(new VotingIssueControlNumbersOperation(), { ElectionID: Pp.ElectionID, EligibleVoterIDs: [target.EligibleVoterID as string] }));
            AssertEqual(issued.Issued?.length, 1, 'one control number');
            const control = issued.Issued?.[0].ControlNumber as string;
            const contest = Pp.Contests[0];
            const submission = { Contests: [{ ContestID: contest.ContestID, Selections: [{ OptionID: contest.OptionIDByLabel.get('Yes') as string }] }] };
            AssertForbidden(await (await C().As('member1')).Call(new VotingEnterPaperBallotOperation(), { ElectionID: Pp.ElectionID, ControlNumber: control, Submission: submission, Channel: 'Paper' }), 'Voting.EnterPaperBallot', 'member1');
            AssertDeclined(await A().Call(new VotingEnterPaperBallotOperation(), { ElectionID: Pp.ElectionID, ControlNumber: 'not-a-real-number', Submission: submission, Channel: 'Paper' }), 'control number', 'invented control number');
            const entered = Ok('Voting.EnterPaperBallot', await A().Call(new VotingEnterPaperBallotOperation(), { ElectionID: Pp.ElectionID, ControlNumber: control, Submission: submission, Channel: 'Paper' }));
            Assert(RECEIPT.test(entered.ReceiptCode ?? ''), 'a receipt is issued for the paper ballot');
            AssertDeclined(await A().Call(new VotingEnterPaperBallotOperation(), { ElectionID: Pp.ElectionID, ControlNumber: control, Submission: submission, Channel: 'Paper' }), 'control number', 'a control number is single-use');
            const m1 = await Pp.Session(P().member1);
            await m1.MustCast({ 'Paper motion': ['No'] });
            const turnout = Ok('turnout', await Pp.Turnout());
            AssertEqual(turnout.Voted, 2, 'one paper plus one online');
            AssertEqual(turnout.ByChannel?.Paper, 1, 'Paper channel');
            AssertEqual(turnout.ByChannel?.Online, 1, 'Online channel');
            const m3 = await Pp.Session(P().member3);
            const part = Ok('participation', await m3.Participation());
            AssertEqual(part.HasVoted, true, 'the paper voter is recorded as voted');
            AssertEqual(part.Channel, 'Paper', 'channel reported to the voter');
            AssertDeclined((await m3.CastPlan({ 'Paper motion': ['No'] })).Result, 'already voted', 'online vote after a paper ballot');
        },
    },
    {
        Id: `${BUNDLE}.WL21`,
        Name: 'WL21 - CreateElection refusals carry their reasons',
        Fn: async () => {
            const rows = [{ Email: P().member1, SourceKey: 'v1' }];
            const base = { Name: Tagged('Wire invalid'), EligibilitySource: { Code: 'csv', Settings: { Rows: rows } }, Contests: [MotionSpec('ok')] };
            const create = (extra: Partial<VotingCreateElectionInput>) => A().Call(new VotingCreateElectionOperation(), { ElectionTypeCode: 'motion', ...base, ...extra });
            AssertDeclined(await create({ ElectionTypeCode: 'no-such-type' }), 'Unknown election type', 'unknown type');
            AssertDeclined(await create({ EligibilitySource: { Code: 'no-such-source', Settings: {} } }), 'Unknown eligibility source', 'unknown source');
            AssertDeclined(await create({ Contests: [] }), 'Contests are required', 'no contests');
            AssertDeclined(await create({ Name: '   ' }), 'needs a name', 'blank name');
            AssertDeclined(await create({ Contests: [{ Name: 'Seat', Kind: 'Office', TallyMethodCode: 'plurality', Options: [{ Label: 'A' }] }] }), 'does not allow', 'an Office contest in a Motion election');
            AssertDeclined(await create({ Contests: [{ ...MotionSpec('bad method'), TallyMethodCode: 'no-such-method' }] }), 'unknown tally method', 'unknown tally method');
            AssertDeclined(await create({ AssuranceTier: 'HighAssurance', ResultsTiming: 'Live' }), 'AfterClose', 'High assurance with live results');
            AssertDeclined(await create({ OpensAt: '2030-01-02T00:00:00Z', ClosesAt: '2030-01-01T00:00:00Z' }), 'OpensAt must be before ClosesAt', 'inverted window');
            AssertDeclined(await create({ Contests: [{ ...MotionSpec('minmax'), MinSelections: 3, MaxSelections: 1 }] }), 'MinSelections exceeds MaxSelections', 'min above max');
            const noRoll = await A().Call(new VotingCreateElectionOperation(), { ElectionTypeCode: 'motion', ...base, EligibilitySource: { Code: 'csv', Settings: { Rows: [{ Email: 'ghost@voting-world.test', SourceKey: 'g' }] } } });
            // an unmatched CSV row is reported, never created: the election is created, the roll freeze is what fails
            Assert(noRoll.Success, 'the call itself reaches the operation');
            if (noRoll.Output?.Success && noRoll.Output.ElectionID) {
                AssertDeclined(await A().Call(new VotingFreezeRollOperation(), { ElectionID: noRoll.Output.ElectionID }), 'no voters', 'a roll whose only row matches nobody');
                const row = await ReadElectionRow(A(), noRoll.Output.ElectionID);
                AssertEqual(row?.RollFrozenAt, null, 'the empty roll was not frozen');
            }
        },
    },
    {
        Id: `${BUNDLE}.WL22`,
        Name: 'WL22 - OpenElection readiness: a High assurance election needs its trustee ceremony; the Verifiable tier needs a provider',
        Fn: async () => {
            const high = await CreateDraftElection(C(), A(), { TypeCode: 'motion', Name: Tagged('Wire needs ceremony'), Voters: [PersonaVoter(C(), 'member1', 0)], Contests: [MotionSpec('Ceremony')], Extra: { SecrecyMode: 'Secret', AssuranceTier: 'HighAssurance' } });
            created.push(high);
            AssertDeclined(await A().Call(new VotingOpenElectionOperation(), { ElectionID: high.ElectionID }), 'trustee key ceremony', 'open a High assurance election without keys');
            AssertEqual((await ReadElectionRow(A(), high.ElectionID))?.Status, 'Draft', 'still Draft');
            const verifiable = await CreateDraftElection(C(), A(), { TypeCode: 'motion', Name: Tagged('Wire verifiable'), Voters: [PersonaVoter(C(), 'member1', 0)], Contests: [MotionSpec('Verifiable')], Extra: { SecrecyMode: 'Secret', AssuranceTier: 'Verifiable' } });
            created.push(verifiable);
            AssertDeclined(await A().Call(new VotingOpenElectionOperation(), { ElectionID: verifiable.ElectionID }), 'ElectionGuard', 'open a Verifiable election');
            AssertEqual((await ReadElectionRow(A(), verifiable.ElectionID))?.Status, 'Draft', 'still Draft');
        },
    },
    {
        Id: `${BUNDLE}.WL23`,
        Name: 'WL23 - the audit trail records the lifecycle and never contains ballot content or receipts',
        Fn: async () => {
            const events = await Rows<{ EventType: string; Details: string | null; OccurredAt: string }>(A(), AUDIT, `ElectionID = '${El().ElectionID}'`, ['EventType', 'Details', 'OccurredAt'], 'OccurredAt');
            const types = events.map((e) => e.EventType);
            for (const wanted of ['Created', 'RollFrozen', 'RollAmended', 'SecondFactorPinsIssued', 'Tallied']) {
                Assert(types.includes(wanted), `audit has a ${wanted} event (got ${types.join(', ')})`);
            }
            const created0 = types.indexOf('Created');
            const frozen = types.indexOf('RollFrozen');
            const tallied = types.indexOf('Tallied');
            Assert(created0 < frozen && frozen < tallied, 'events are in lifecycle order');
            const everything = events.map((e) => e.Details ?? '').join('\n');
            for (const [label, receipt] of Object.entries(receipts)) Assert(!everything.includes(receipt), `audit does not contain ${label}'s receipt`);
            const contest = El().Contests[0];
            Assert(!everything.includes(contest.OptionIDByLabel.get('Yes') as string) && !everything.includes(contest.OptionIDByLabel.get('No') as string), 'audit does not contain option ids');
            Assert(!/"Selections"/.test(everything), 'audit does not contain a ballot submission');
        },
    },
    {
        Id: `${BUNDLE}.WL24`,
        Name: 'WL24 - read-your-writes: a plain RunView of the election (cache allowed) reflects each transition made by an operation',
        Fn: async () => {
            const E = await CreateDraftElection(C(), A(), { TypeCode: 'motion', Name: Tagged('Wire freshness'), Voters: [PersonaVoter(C(), 'member1', 0), PersonaVoter(C(), 'member2', 1)], Contests: [MotionSpec('Freshness')], Extra: { SecrecyMode: 'Secret' } });
            created.push(E);
            // What this proves: the SERVER serves no stale election after an operation's write (the operations drop the
            // server's cached Elections views once their work commits, RefreshCachedViews). What it must step around: MJ's
            // CLIENT provider replays an identical RunView resolved within ProviderBase.DedupLingerMs (5 s by default) and
            // only drops that replay on a BaseEntity event raised in the client process. A write made on the server by a Remote
            // Operation raises none there (no cache-invalidation subscription without Redis + websockets), so an immediate
            // identical read can be served the pre-write rows by the client itself. That is MJ core behaviour, documented in
            // docs/voting/known-limitations.md ("Caching"); each read below therefore waits out this client's linger window
            // since its previous identical read, and then must reflect the transition.
            let lastRead = 0;
            const plain = async (): Promise<{ Status: string; RollFrozenAt: string | null }> => {
                const wait = lastRead + ProviderBase.DedupLingerMs + 100 - Date.now();
                if (wait > 0) await new Promise((r) => setTimeout(r, wait));
                const res = await A().RunView<{ Status: string; RollFrozenAt: string | null }>({ EntityName: 'MJ_BizApps_Voting: Elections', ExtraFilter: `ID = '${E.ElectionID}'`, Fields: ['Status', 'RollFrozenAt'], ResultType: 'simple' });
                lastRead = Date.now();
                if (!res.Success) throw new Error(res.ErrorMessage);
                return res.Results[0];
            };
            AssertEqual((await plain()).Status, 'Draft', 'status after create');
            await E.Freeze();
            Assert((await plain()).RollFrozenAt !== null, 'the freeze is visible to the next plain read');
            await E.Distribute();
            await E.Open();
            AssertEqual((await plain()).Status, 'Open', 'the open is visible to the next plain read');
            await E.Close();
            AssertEqual((await plain()).Status, 'Closed', 'the close is visible to the next plain read');
        },
    },
    {
        Id: `${BUNDLE}.WL25`,
        Name: 'WL25 - nominations: voters nominate, the admin decides, an approved nominee becomes a ballot option the electorate can vote for',
        Fn: async () => {
            const N = await CreateDraftElection(C(), A(), {
                TypeCode: 'board-election',
                Name: Tagged('Wire nominations'),
                Voters: [PersonaVoter(C(), 'member1', 0), PersonaVoter(C(), 'member2', 1), PersonaVoter(C(), 'member3', 2), PersonaVoter(C(), 'trustee1', 3)],
                Contests: [{ Name: 'Nominated seat', Kind: 'Office', TallyMethodCode: 'plurality', Seats: 1, AllowAbstain: true }],
                Extra: { SecrecyMode: 'Secret' },
            });
            created.push(N);
            const contestID = N.Contests[0].ContestID;
            const member1 = await C().As('member1');
            const nominate = (client: WireClient, nominee: string) => client.Call(new VotingSubmitNominationOperation(), { ContestID: contestID, NomineePersonID: nominee, Statement: 'wire statement' });

            AssertDeclined(await nominate(member1, C().Record('member2').PersonID as string), 'not on the roll', 'nominating before the roll exists');
            AssertForbidden(await member1.Call(new VotingOpenNominationsOperation(), { ElectionID: N.ElectionID }), 'Voting.OpenNominations', 'member1');
            const opened = Ok('Voting.OpenNominations', await A().Call(new VotingOpenNominationsOperation(), { ElectionID: N.ElectionID }));
            AssertEqual(opened.Status, 'Nominations', 'status');
            AssertDeclined(await A().Call(new VotingOpenElectionOperation(), { ElectionID: N.ElectionID }), 'has no options', 'opening an office with no candidates');
            AssertEqual((await ReadElectionRow(A(), N.ElectionID))?.Status, 'Nominations', 'still taking nominations');

            const approvedNomination = Ok('nominate member2', await nominate(member1, C().Record('member2').PersonID as string));
            Assert(!!approvedNomination.NominationID, 'a nomination id is returned');
            AssertDeclined(await nominate(member1, C().Record('member2').PersonID as string), 'already been nominated', 'the same nominee twice');
            AssertDeclined(await nominate(member1, '00000000-0000-4000-8000-000000000000'), 'not a known person', 'an unknown nominee');
            AssertDeclined(await nominate(await C().As('outsider'), C().Record('member3').PersonID as string), 'not on the roll', 'a non-voter nominating');
            const rejectedNomination = Ok('nominate trustee1', await nominate(member1, C().Record('trustee1').PersonID as string));

            const decide = (id: string, decision: 'Approved' | 'Rejected', client: WireClient = A()) => client.Call(new VotingDecideNominationOperation(), { NominationID: id, Decision: decision });
            AssertForbidden(await decide(approvedNomination.NominationID as string, 'Approved', member1), 'Voting.DecideNomination', 'member1');
            const approved = Ok('approve', await decide(approvedNomination.NominationID as string, 'Approved'));
            AssertEqual(approved.Status, 'Approved', 'approved status');
            Assert(!!approved.ContestOptionID, 'approval creates a ballot option');
            const rejected = Ok('reject', await decide(rejectedNomination.NominationID as string, 'Rejected'));
            AssertEqual(rejected.Status, 'Rejected', 'rejected status');
            AssertEqual(rejected.ContestOptionID ?? null, null, 'a rejection creates no option');
            await N.RefreshContests();
            const labels = [...N.Contests[0].OptionIDByLabel.keys()];
            AssertEqual(labels.length, 1, 'exactly one candidate on the ballot');
            Assert(labels[0].includes('MemberTwo'), `the candidate is the approved nominee (got "${labels[0]}")`);

            const closed = Ok('Voting.CloseNominations', await A().Call(new VotingCloseNominationsOperation(), { ElectionID: N.ElectionID }));
            AssertEqual(closed.Status, 'Ready', 'closing nominations makes the election Ready');
            AssertDeclined(await nominate(member1, C().Record('member3').PersonID as string), 'not accepting nominations', 'nominating after nominations close');

            // the electorate can now vote for the nominee
            const live = N;
            await live.GoLive();
            await CastAll(live, [{ 'Nominated seat': [labels[0]] }, { 'Nominated seat': [labels[0]] }]);
            AssertEqual(Ok('turnout', await live.Turnout()).Voted, 2, 'two votes for the nominee');
        },
    },
    {
        Id: `${BUNDLE}.WL26`,
        Name: 'WL26 - challenging a voter on the roll: reason required, admin only, the voter is out of the electorate',
        Fn: async () => {
            const Ch = await CreateDraftElection(C(), A(), { TypeCode: 'motion', Name: Tagged('Wire challenge'), Voters: [PersonaVoter(C(), 'member1', 0), PersonaVoter(C(), 'member2', 1), PersonaVoter(C(), 'member3', 2)], Contests: [MotionSpec('Challenge motion')], Extra: { SecrecyMode: 'Secret' } });
            created.push(Ch);
            await Ch.Freeze();
            const roll = await Rows<{ ID: string; PersonID: string }>(A(), ELIGIBLE_VOTERS, `ElectionID = '${Ch.ElectionID}'`, ['ID', 'PersonID']);
            const target = roll.find((r) => r.PersonID.toLowerCase() === (C().Record('member3').PersonID as string).toLowerCase());
            Assert(!!target, 'member3 is on the roll');
            const challenge = (client: WireClient, reason: string) => client.Call(new VotingChallengeVoterOperation(), { EligibleVoterID: target!.ID, Reason: reason });
            AssertForbidden(await challenge(await C().As('member1'), 'not a member'), 'Voting.ChallengeVoter', 'member1');
            AssertDeclined(await challenge(A(), ' '), 'needs a reason', 'a challenge without a reason');
            Ok('challenge', await challenge(A(), 'wire test: membership lapsed'));
            const status = await Rows<{ Status: string }>(A(), ELIGIBLE_VOTERS, `ID = '${target!.ID}'`, ['Status']);
            AssertEqual(status[0].Status, 'Challenged', 'the voter is marked Challenged');
            AssertEqual(Ok('turnout', await Ch.Turnout()).Eligible, 2, 'a challenged voter is not eligible');
            AssertDeclined(await challenge(A(), 'again'), 'already challenged', 'challenging twice');
            await Ch.Distribute();
            await Ch.Open();
            await Ch.IssuePins().catch(() => undefined);
            const m3 = await C().As('member3');
            AssertDeclined(await m3.Call(new VotingGetMyBallotOperation(), { ElectionID: Ch.ElectionID }), 'not on the roll', 'the challenged voter asking for a ballot');
        },
    },
    {
        Id: `${BUNDLE}.WL27`,
        Name: 'WL27 - write-ins: AllowWriteIn alone gives the ballot one write-in option; a write-in vote is cast and counted',
        Fn: async () => {
            const Wi = await CreateLiveElection(C(), A(), {
                TypeCode: 'board-election',
                Name: Tagged('Wire write-in'),
                Voters: [PersonaVoter(C(), 'member1', 0), PersonaVoter(C(), 'member2', 1)],
                // the spec names only the candidates: the write-in option must come from CreateElection
                Contests: [{ Name: 'Secretary', Kind: 'Office', TallyMethodCode: 'plurality', Seats: 1, AllowWriteIn: true, Options: [{ Label: 'Ada' }, { Label: 'Grace' }] }],
                Extra: { SecrecyMode: 'Secret' },
            });
            created.push(Wi);
            const contest = Wi.Contests[0];
            const options = await Rows<{ ID: string; Label: string; IsWriteIn: boolean }>(A(), OPTIONS, `ContestID = '${contest.ContestID}'`, ['ID', 'Label', 'IsWriteIn'], 'Sequence');
            AssertEqual(options.map((o) => o.Label).join(','), 'Ada,Grace,Write-in', 'the candidates, then the write-in option');
            AssertEqual(options.filter((o) => o.IsWriteIn).length, 1, 'exactly one write-in option');
            const writeIn = options.find((o) => o.IsWriteIn)!;

            const m1 = await Wi.Session(P().member1);
            const style = Ok('Voting.GetMyBallot', await m1.GetBallot()).Style;
            const styleOption = style?.Contests[0].Options.find((o) => o.OptionID.toLowerCase() === writeIn.ID.toLowerCase());
            AssertEqual(styleOption?.IsWriteIn, true, 'the voter\'s ballot style offers the write-in option');
            const submission = (text?: string) => ({ Contests: [{ ContestID: contest.ContestID, Selections: [{ OptionID: writeIn.ID, WriteInText: text }] }] });
            AssertDeclined((await m1.CastPlan({}, { Submission: submission() })).Result, 'WriteInRequired', 'the write-in option with no name');
            const accepted = await m1.CastPlan({}, { Submission: submission('Alan Turing') });
            Assert(accepted.Accepted, `the write-in ballot is accepted (${accepted.Message ?? ''})`);
            await (await Wi.Session(P().member2)).MustCast({ Secretary: ['Ada'] });
            const result = Wi.LabelAll(Ok('Voting.Tally', await (async () => { await Wi.Close(); return Wi.TallyAs(A(), 'wire-writein'); })()).Contests).get('Secretary');
            AssertEqual(result?.Options['Write-in']?.Votes, 1, 'the write-in vote is counted on the write-in option');
            AssertEqual(result?.Options['Ada']?.Votes, 1, 'Ada');
        },
    },
    {
        Id: `${BUNDLE}.WL28`,
        Name: 'WL28 - re-tally: the recount path replaces the results (one final per contest), audited with the actor; refused once Certified',
        Fn: async () => {
            const R = await CreateLiveElection(C(), A(), {
                TypeCode: 'motion',
                Name: Tagged('Wire re-tally'),
                Voters: [PersonaVoter(C(), 'member1', 0), PersonaVoter(C(), 'member2', 1), PersonaVoter(C(), 'member3', 2)],
                Contests: [MotionSpec('Recount motion')],
                Extra: { SecrecyMode: 'Secret' },
            });
            created.push(R);
            await CastAll(R, [{ 'Recount motion': ['Yes'] }, { 'Recount motion': ['Yes'] }, { 'Recount motion': ['No'] }]);
            await R.Close();
            const first = Ok('Voting.Tally', await R.TallyAs(A(), 'recount-1'));
            const second = Ok('Voting.Tally (re-tally)', await R.TallyAs(A(), 'recount-2'));
            AssertEqual(second.Status, 'Tallied', 'a re-tally leaves the election Tallied');
            AssertEqual(JSON.stringify(R.LabelAll(second.Contests).get('Recount motion')?.Options), JSON.stringify(R.LabelAll(first.Contests).get('Recount motion')?.Options), 'the recount gives the same counts');
            const contestID = R.Contests[0].ContestID;
            const results = await Rows<{ ID: string; IsFinal: boolean }>(A(), CONTEST_RESULTS, `ContestID = '${contestID}'`, ['ID', 'IsFinal']);
            AssertEqual(results.filter((r) => r.IsFinal).length, 1, 'exactly one final result for the contest after the re-tally');
            AssertEqual(results.length, 2, 'the earlier result is kept as history (demoted), not duplicated as final');
            const audit = await Rows<{ EventType: string; ActorUserID: string | null; Details: string | null }>(A(), AUDIT, `ElectionID = '${R.ElectionID}' AND EventType = 'Tallied'`, ['EventType', 'ActorUserID', 'Details'], 'OccurredAt');
            AssertEqual(audit.length, 2, 'both tallies are audited');
            const adminUser = C().Record('admin').UserID.toLowerCase();
            for (const ev of audit) AssertEqual(ev.ActorUserID?.toLowerCase(), adminUser, 'the tally audit names the administrator who ran it');
            AssertEqual((JSON.parse(audit[1].Details ?? '{}') as { Retally?: boolean }).Retally, true, 'the second event is marked as a re-tally');

            Ok('Voting.Certify', await R.CertifyAs(await C().As('inspector'), 'wire re-tally'));
            AssertEqual((await ReadElectionRow(A(), R.ElectionID))?.Status, 'Certified', 'certified');
            AssertDeclined(await R.TallyAs(A(), 'recount-3'), 'results are final', 'a re-tally of a Certified election');
            const after = await Rows<{ ID: string }>(A(), CONTEST_RESULTS, `ContestID = '${contestID}'`, ['ID']);
            AssertEqual(after.length, 2, 'the refused re-tally wrote nothing');
        },
    },
    {
        Id: `${BUNDLE}.WL29`,
        Name: 'WL29 - no new ballot distribution for a Closed, Tallied, Certified or Cancelled election (an Open one still takes one)',
        Fn: async () => {
            const D = await CreateLiveElection(C(), A(), {
                TypeCode: 'motion',
                Name: Tagged('Wire late distribution'),
                Voters: [PersonaVoter(C(), 'member1', 0), PersonaVoter(C(), 'member2', 1)],
                Contests: [MotionSpec('Late motion')],
                Extra: { SecrecyMode: 'Secret' },
            });
            created.push(D);
            const open = await D.TryDistribute();
            Assert(open.Saved, `an Open election still takes a second distribution (${open.Message})`);
            await CastAll(D, [{ 'Late motion': ['Yes'] }]);
            const refusedAt = async (status: string): Promise<void> => {
                AssertEqual((await ReadElectionRow(A(), D.ElectionID))?.Status, status, 'status');
                const attempt = await D.TryDistribute();
                Assert(!attempt.Saved, `a distribution for a ${status} election was created`);
                Assert(attempt.Message.includes('no longer accepts ballots'), `the refusal names the reason (got "${attempt.Message}")`);
            };
            await D.Close();
            await refusedAt('Closed');
            Ok('Voting.Tally', await D.TallyAs(A(), 'late'));
            await refusedAt('Tallied');
            Ok('Voting.Certify', await D.CertifyAs(await C().As('inspector'), 'wire late distribution'));
            await refusedAt('Certified');

            const X = await CreateDraftElection(C(), A(), { TypeCode: 'motion', Name: Tagged('Wire cancelled distribution'), Voters: [PersonaVoter(C(), 'member1', 0)], Contests: [MotionSpec('Cancelled')], Extra: { SecrecyMode: 'Secret' } });
            created.push(X);
            Ok('Voting.CancelElection', await A().Call(new VotingCancelElectionOperation(), { ElectionID: X.ElectionID, Reason: 'wire test: late distribution' }));
            const cancelled = await X.TryDistribute();
            Assert(!cancelled.Saved && cancelled.Message.includes('Cancelled'), `a distribution for a Cancelled election is refused (got "${cancelled.Message}")`);
        },
    },
    {
        Id: `${BUNDLE}.WL30`,
        Name: 'WL30 - an audit event written by a voter operation names the voter who called it, and carries no ballot content',
        Fn: async () => {
            const N = await CreateDraftElection(C(), A(), {
                TypeCode: 'board-election',
                Name: Tagged('Wire audit actor'),
                Voters: [PersonaVoter(C(), 'member1', 0), PersonaVoter(C(), 'member2', 1)],
                Contests: [{ Name: 'Audited seat', Kind: 'Office', TallyMethodCode: 'plurality', Seats: 1, AllowAbstain: true }],
                Extra: { SecrecyMode: 'Secret' },
            });
            created.push(N);
            Ok('Voting.OpenNominations', await A().Call(new VotingOpenNominationsOperation(), { ElectionID: N.ElectionID }));
            const member1 = await C().As('member1');
            Ok('nominate', await member1.Call(new VotingSubmitNominationOperation(), { ContestID: N.Contests[0].ContestID, NomineePersonID: C().Record('member2').PersonID as string, Statement: 'wire audit' }));
            const events = await Rows<{ EventType: string; ActorUserID: string | null; Details: string | null }>(A(), AUDIT, `ElectionID = '${N.ElectionID}'`, ['EventType', 'ActorUserID', 'Details'], 'OccurredAt');
            const nominated = events.find((e) => e.EventType === 'NominationSubmitted');
            Assert(!!nominated, `a NominationSubmitted event exists (got ${events.map((e) => e.EventType).join(', ')})`);
            AssertEqual(nominated!.ActorUserID?.toLowerCase(), C().Record('member1').UserID.toLowerCase(), 'the event names the member who nominated, not the system user');
            const opened = events.find((e) => e.EventType === 'NominationsOpened');
            AssertEqual(opened?.ActorUserID?.toLowerCase(), C().Record('admin').UserID.toLowerCase(), 'administrator events still name the administrator');
        },
    },
];

for (const check of checks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async () => {
        cast = await WireCast.Create();
        admin = await cast.As('admin');
        await LoadVotingWorld(cast);
        L = await CreateDraftElection(cast, admin, {
            TypeCode: 'motion',
            Name: Tagged('Wire lifecycle'),
            Voters: MainRoll(),
            Contests: [MotionSpec('Adopt the wire resolution')],
            Extra: { SecrecyMode: 'Secret', ResultsTiming: 'AfterClose', ResultsAudience: 'Voters' },
        });
        created.length = 0;
    },
    Teardown: async () => {
        const a = admin;
        if (a) {
            for (const e of [L, ...created]) {
                if (e) await e.Cleanup();
            }
        }
        cast = undefined;
        admin = undefined;
        L = undefined;
        created.length = 0;
    },
});
