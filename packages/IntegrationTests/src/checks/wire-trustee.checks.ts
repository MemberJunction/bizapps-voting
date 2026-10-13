/**
 * wire-trustee: the tier B (High assurance) key ceremony and trustee-gated tally, driven over GraphQL by the admin persona
 * and the three trustee personas.
 *
 *   WX1  CreateTrusteeKeys refusals: not an admin, wrong tier, bad thresholds, duplicate / unknown trustees
 *   WX2  the ceremony: public key, k-of-n shares returned once, one per trustee, nothing secret stored, repeat refused
 *   WX3  the election opens only after the ceremony; members and guests cast; key shares are not accepted while voting is open
 *   WX4  a closed tier B election cannot be tallied without the key; the refusal says how many shares are missing
 *   WX5  share submission refusals: non-trustees, someone else's share, tampered / swapped shares, guests, wrong index
 *   WX6  fewer than k shares do not unlock the tally; k shares (any k) do; results match the hand-worked ballots
 *   WX7  the key is wiped by the tally: a re-tally needs the shares again
 *   WX8  a 3-of-3 ceremony: two of three shares are not enough
 *   WX9  tier B results stay hidden until the tally, for everyone
 */
import { Assert, AssertEqual, IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration/registry';
import {
    VotingCreateTrusteeKeysOperation,
    VotingGetResultsOperation,
    VotingSubmitKeyShareOperation,
    type VotingTrusteeKeyShare,
} from '@mj-biz-apps/voting-entities';
import { LoadVotingWorld } from '../world/voting-world.js';
import {
    AssertDeclined,
    AssertForbidden,
    CastAll,
    CreateDraftElection,
    MotionSpec,
    Ok,
    PersonaVoter,
    ReadElectionRow,
    Tagged,
    WorldGuest,
    type LiveElection,
    type WireVoterSpec,
} from '../wire/wire-kit.js';
import type { PersonaKey } from '../wire/persona-model.js';
import { WireCast } from '../wire/wire-cast.js';
import type { WireClient } from '../wire/wire-client.js';

const BUNDLE = 'wire-trustee';
const ELECTIONS = 'MJ_BizApps_Voting: Elections';
const TRUSTEES = 'MJ_BizApps_Voting: Election Trustees';
const COMMITMENTS = 'MJ_BizApps_Voting: Trustee Key Commitments';
const TRUSTEE_KEYS: PersonaKey[] = ['trustee1', 'trustee2', 'trustee3'];

let cast: WireCast | undefined;
let admin: WireClient | undefined;
const made: LiveElection[] = [];

/** The main tier B election and its ceremony output. */
let T: LiveElection | undefined;
let publicKey = '';
let shares: VotingTrusteeKeyShare[] = [];

const C = (): WireCast => {
    if (!cast) throw new Error('wire-trustee setup did not run');
    return cast;
};
const A = (): WireClient => {
    if (!admin) throw new Error('wire-trustee setup did not run');
    return admin;
};
const El = (): LiveElection => {
    if (!T) throw new Error('wire-trustee setup did not run');
    return T;
};

const personID = (key: PersonaKey): string => C().Record(key).PersonID as string;

function ShareOf(key: PersonaKey, from: VotingTrusteeKeyShare[] = shares): VotingTrusteeKeyShare {
    const s = from.find((x) => x.TrusteePersonID.toLowerCase() === personID(key).toLowerCase());
    if (!s) throw new Error(`no share for ${key}`);
    return s;
}

function Roll(): WireVoterSpec[] {
    return [PersonaVoter(C(), 'member1', 0), PersonaVoter(C(), 'member2', 1), PersonaVoter(C(), 'member3', 2), PersonaVoter(C(), 'member4', 3), WorldGuest(44), WorldGuest(45)];
}

function Spec(name: string, voters: WireVoterSpec[], tier: 'HighAssurance' | 'Standard' = 'HighAssurance') {
    return { TypeCode: 'motion', Name: Tagged(name), Voters: voters, Contests: [MotionSpec('Tier B motion')], Extra: { SecrecyMode: 'Secret' as const, AssuranceTier: tier, ResultsTiming: 'AfterClose' as const } };
}

async function Submit(client: WireClient, electionID: string, index: number, share: string) {
    return client.Call(new VotingSubmitKeyShareOperation(), { ElectionID: electionID, ShareIndex: index, Share: share });
}

const checks: NamedCheck[] = [
    {
        Id: `${BUNDLE}.WX1`,
        Name: 'WX1 - CreateTrusteeKeys refusals: not an admin, wrong tier, bad thresholds, duplicate and unknown trustees',
        Fn: async () => {
            const t = [personID('trustee1'), personID('trustee2'), personID('trustee3')];
            const create = async (client: WireClient, e: LiveElection, ids: string[], k: number) => client.Call(new VotingCreateTrusteeKeysOperation(), { ElectionID: e.ElectionID, TrusteePersonIDs: ids, Threshold: k });

            AssertForbidden(await create(await C().As('member1'), El(), t, 2), 'Voting.CreateTrusteeKeys', 'member1');
            AssertForbidden(await create(await C().As('trustee1'), El(), t, 2), 'Voting.CreateTrusteeKeys', 'a trustee');
            AssertForbidden(await create(await C().As('inspector'), El(), t, 2), 'Voting.CreateTrusteeKeys', 'inspector');

            const standard = await CreateDraftElection(C(), A(), Spec('Wire tier A no ceremony', [PersonaVoter(C(), 'member1', 0)], 'Standard'));
            made.push(standard);
            AssertDeclined(await create(A(), standard, t, 2), 'High assurance', 'a Standard election has no ceremony');

            AssertDeclined(await create(A(), El(), t, 1), 'whole number from 2 up to the number of trustees', 'threshold 1');
            AssertDeclined(await create(A(), El(), t, 4), 'whole number from 2 up to the number of trustees', 'threshold above the trustee count');
            AssertDeclined(await create(A(), El(), t, 2.5), 'whole number', 'fractional threshold');
            AssertDeclined(await create(A(), El(), [t[0]], 2), 'at least two distinct trustees', 'a single trustee');
            AssertDeclined(await create(A(), El(), [t[0], t[0], t[1]], 2), 'at least two distinct trustees', 'a duplicated trustee');
            AssertDeclined(await create(A(), El(), [t[0], '00000000-0000-4000-8000-000000000000'], 2), 'not a known person', 'an unknown trustee');

            const row = await ReadElectionRow(A(), El().ElectionID);
            AssertEqual(row?.Status, 'Draft', 'nothing changed');
            const keyed = await A().RunView<{ ElectionPublicKey: string | null }>({ EntityName: ELECTIONS, ExtraFilter: `ID = '${El().ElectionID}'`, Fields: ['ElectionPublicKey'], ResultType: 'simple', BypassCache: true });
            AssertEqual(keyed.Results[0]?.ElectionPublicKey ?? null, null, 'no key was stored by any refused call');
        },
    },
    {
        Id: `${BUNDLE}.WX2`,
        Name: 'WX2 - the ceremony: a public key, 2-of-3 shares returned once (one per trustee), nothing secret stored, repeat refused',
        Fn: async () => {
            const ids = TRUSTEE_KEYS.map(personID);
            const out = Ok('Voting.CreateTrusteeKeys', await A().Call(new VotingCreateTrusteeKeysOperation(), { ElectionID: El().ElectionID, TrusteePersonIDs: ids, Threshold: 2 }));
            publicKey = out.PublicKey ?? '';
            shares = out.Shares ?? [];
            Assert(publicKey.includes('BEGIN PUBLIC KEY'), 'a PEM public key is returned');
            Assert(!publicKey.includes('PRIVATE'), 'no private key material in the public key');
            AssertEqual(shares.length, 3, 'one share per trustee');
            AssertEqual(shares.map((s) => s.ShareIndex).sort().join(','), '1,2,3', 'share indexes 1..3');
            AssertEqual(new Set(shares.map((s) => s.Share)).size, 3, 'shares are distinct');
            Assert(shares.every((s) => s.Share.length > 20), 'shares are not trivially short');
            for (const key of TRUSTEE_KEYS) AssertEqual(ShareOf(key).TrusteePersonID.toLowerCase(), personID(key).toLowerCase(), `${key} has its own share`);

            const row = await A().RunView<{ ElectionPublicKey: string | null; TrusteeThreshold: number | null; Status: string }>({ EntityName: ELECTIONS, ExtraFilter: `ID = '${El().ElectionID}'`, Fields: ['ElectionPublicKey', 'TrusteeThreshold', 'Status'], ResultType: 'simple', BypassCache: true });
            AssertEqual(row.Results[0]?.ElectionPublicKey, publicKey, 'the election stores the same public key');
            AssertEqual(row.Results[0]?.TrusteeThreshold, 2, 'the threshold is stored');
            AssertEqual(row.Results[0]?.Status, 'Draft', 'the ceremony does not open the election');

            const trustees = await A().RunView<{ ID: string; TrusteePersonID: string; ShareIndex: number; Status: string }>({ EntityName: TRUSTEES, ExtraFilter: `ElectionID = '${El().ElectionID}'`, Fields: ['ID', 'TrusteePersonID', 'ShareIndex', 'Status'], ResultType: 'simple', BypassCache: true });
            Assert(trustees.Success, `trustee rows readable by the admin (${trustees.ErrorMessage})`);
            AssertEqual(trustees.Results.length, 3, 'three trustee rows');
            const commitments = await A().RunView<{ PublicShare: string; Commitment: string }>({ EntityName: COMMITMENTS, ExtraFilter: `ElectionTrusteeID IN (${trustees.Results.map((x) => `'${x.ID}'`).join(',')})`, Fields: ['PublicShare', 'Commitment'], ResultType: 'simple', BypassCache: true });
            Assert(commitments.Success, `commitments readable by the admin (${commitments.ErrorMessage})`);
            AssertEqual(commitments.Results.length, 3, 'three key commitments');
            for (const s of shares) {
                Assert(!commitments.Results.some((c) => c.PublicShare === s.Share || c.Commitment === s.Share), `share ${s.ShareIndex} is nowhere in the stored commitments (returned once, never stored)`);
            }

            AssertDeclined(await A().Call(new VotingCreateTrusteeKeysOperation(), { ElectionID: El().ElectionID, TrusteePersonIDs: ids, Threshold: 2 }), 'already has trustee keys', 'a second ceremony');
        },
    },
    {
        Id: `${BUNDLE}.WX3`,
        Name: 'WX3 - after the ceremony the election opens; members and guests cast; key shares are refused while voting is open',
        Fn: async () => {
            await El().Freeze();
            await El().Distribute();
            await El().Open();
            await El().IssuePins();
            AssertEqual((await ReadElectionRow(A(), El().ElectionID))?.Status, 'Open', 'status');
            AssertDeclined(await A().Call(new VotingCreateTrusteeKeysOperation(), { ElectionID: El().ElectionID, TrusteePersonIDs: TRUSTEE_KEYS.map(personID), Threshold: 2 }), 'Draft or Ready', 'ceremony after open');

            // 3 Yes (member1, member2, w44), 1 No (member3), 1 abstain (w51); member4 does not vote.
            const plan = (p: 'Yes' | 'No' | 'abstain') => ({ 'Tier B motion': p === 'abstain' ? ('abstain' as const) : [p] });
            await CastAll(
                El(),
                [plan('Yes'), plan('Yes'), plan('No'), plan('Yes'), plan('abstain')],
                [C().Record('member1').Email, C().Record('member2').Email, C().Record('member3').Email, WorldGuest(44).Email, WorldGuest(45).Email]
            );
            AssertEqual(Ok('turnout', await El().Turnout()).Voted, 5, 'five of six voted');
            const part = Ok('participation member4', await (await El().Session(C().Record('member4').Email)).Participation());
            AssertEqual(part.HasVoted, false, 'member4 did not vote');

            AssertDeclined(await Submit(await C().As('trustee1'), El().ElectionID, ShareOf('trustee1').ShareIndex, ShareOf('trustee1').Share), 'once voting has closed', 'a share while voting is open');
        },
    },
    {
        Id: `${BUNDLE}.WX4`,
        Name: 'WX4 - a closed tier B election cannot be tallied without the key; the refusal says how many shares are missing',
        Fn: async () => {
            await El().Close();
            const early = await El().TallyAs(A(), 'trustee-seed');
            AssertDeclined(early, 'trustee key shares', 'tally with no shares');
            Assert((early.Output?.Message ?? '').includes('0 received'), `the refusal counts the shares held (got "${early.Output?.Message}")`);
            Assert((early.Output?.Message ?? '').includes('2'), 'the refusal names the threshold');
            AssertEqual((await ReadElectionRow(A(), El().ElectionID))?.Status, 'Closed', 'a refused tally leaves the election Closed');
            const results = await El().ResultsFor(A());
            AssertEqual(results.Output?.Visible, false, 'nothing to show before the tally, even to the admin');
        },
    },
    {
        Id: `${BUNDLE}.WX5`,
        Name: 'WX5 - share submission refusals: non-trustees, someone else\'s share, tampered or swapped shares, guests, a wrong index',
        Fn: async () => {
            const e = El().ElectionID;
            const t1 = await C().As('trustee1');
            const t2 = await C().As('trustee2');
            const s1 = ShareOf('trustee1');
            const s2 = ShareOf('trustee2');

            AssertDeclined(await Submit(await C().As('outsider'), e, s1.ShareIndex, s1.Share), 'not a trustee of this election', 'a user with no Person');
            AssertDeclined(await Submit(await C().As('member1'), e, s1.ShareIndex, s1.Share), 'not the trustee for that share', 'a member who is not a trustee');
            AssertDeclined(await Submit(t2, e, s1.ShareIndex, s1.Share), 'not the trustee for that share', 'trustee2 submitting trustee1\'s share');
            AssertDeclined(await Submit(t1, e, 99, s1.Share), 'not the trustee for that share', 'an index nobody holds');
            const flipped = s1.Share.slice(0, -1) + (s1.Share.endsWith('0') ? '1' : '0');
            AssertDeclined(await Submit(t1, e, s1.ShareIndex, flipped), 'does not match its commitment', 'a tampered share');
            AssertDeclined(await Submit(t1, e, s1.ShareIndex, s2.Share), 'does not match its commitment', 'trustee2\'s share under trustee1\'s index');
            AssertDeclined(await Submit(t1, e, s1.ShareIndex, ''), 'are required', 'an empty share');
            const guest = await El().Session(WorldGuest(44).Email);
            AssertForbidden(await Submit(guest.Client, e, s1.ShareIndex, s1.Share), 'Voting.SubmitKeyShare', 'a guest ballot session');
            AssertEqual((await El().TallyAs(A(), 'trustee-seed')).Output?.Success, false, 'none of the refused submissions unlocked the tally');
        },
    },
    {
        Id: `${BUNDLE}.WX6`,
        Name: 'WX6 - one share (of k=2) does not unlock the tally; a second, from a different trustee, does; the result matches the ballots',
        Fn: async () => {
            const e = El().ElectionID;
            const first = Ok('trustee1 share', await Submit(await C().As('trustee1'), e, ShareOf('trustee1').ShareIndex, ShareOf('trustee1').Share));
            AssertEqual(first.Accepted, true, 'the first valid share is accepted');
            AssertEqual(first.SharesReceived, 1, 'one share held');
            AssertEqual(first.SharesRequired, 2, 'two required');
            const stillLocked = await El().TallyAs(A(), 'trustee-seed');
            AssertDeclined(stillLocked, 'trustee key shares', 'tally with 1 of 2 shares');
            Assert((stillLocked.Output?.Message ?? '').includes('1 received'), `the refusal counts one share (got "${stillLocked.Output?.Message}")`);

            // resubmitting the same share adds nothing
            const again = await Submit(await C().As('trustee1'), e, ShareOf('trustee1').ShareIndex, ShareOf('trustee1').Share);
            if (again.Output?.Success) AssertEqual(again.Output.SharesReceived, 1, 'the same share twice still counts once');
            AssertDeclined(await El().TallyAs(A(), 'trustee-seed'), 'trustee key shares', 'tally after a duplicate submission');

            // trustees 1 and 3 (not adjacent): any k of n works
            const second = Ok('trustee3 share', await Submit(await C().As('trustee3'), e, ShareOf('trustee3').ShareIndex, ShareOf('trustee3').Share));
            AssertEqual(second.SharesReceived, 2, 'two shares held');
            const tallied = Ok('Voting.Tally', await El().TallyAs(A(), 'trustee-seed'));
            AssertEqual(tallied.Status, 'Tallied', 'status');
            const motion = El().LabelAll(tallied.Contests).get('Tier B motion');
            AssertEqual(motion?.Outcome, 'Passed', 'outcome');
            AssertEqual(motion?.Options['Yes'].Votes, 3, 'Yes');
            AssertEqual(motion?.Options['No'].Votes, 1, 'No');
            AssertEqual(motion?.VotesCast, 4, 'votes cast');
            AssertEqual(motion?.Abstentions, 1, 'abstentions');

            // the member sees the same thing through GetResults
            const read = await El().ResultsFor(await C().As('member1'));
            AssertEqual(read.Output?.Visible, true, 'a voter sees the tier B result after the tally');
            AssertEqual(El().LabelAll(read.Output?.Contests).get('Tier B motion')?.Options['Yes'].Votes, 3, 'GetResults agrees');
        },
    },
    {
        Id: `${BUNDLE}.WX7`,
        Name: 'WX7 - the tally wipes the key: a re-tally needs the trustees again',
        Fn: async () => {
            const again = await El().TallyAs(A(), 'trustee-seed-2');
            AssertDeclined(again, 'trustee key shares', 're-tally without fresh shares');
            Assert((again.Output?.Message ?? '').includes('0 received'), `no key material is left after the tally (got "${again.Output?.Message}")`);
            AssertEqual((await ReadElectionRow(A(), El().ElectionID))?.Status, 'Tallied', 'the result of record is untouched');
            // two shares again, and the re-tally agrees
            await Submit(await C().As('trustee2'), El().ElectionID, ShareOf('trustee2').ShareIndex, ShareOf('trustee2').Share);
            await Submit(await C().As('trustee3'), El().ElectionID, ShareOf('trustee3').ShareIndex, ShareOf('trustee3').Share);
            const retally = Ok('re-tally', await El().TallyAs(A(), 'trustee-seed-2'));
            AssertEqual(El().LabelAll(retally.Contests).get('Tier B motion')?.Options['Yes'].Votes, 3, 'the re-tally reproduces the count');
        },
    },
    {
        Id: `${BUNDLE}.WX8`,
        Name: 'WX8 - a 3-of-3 ceremony: two shares are not enough, the third unlocks the tally',
        Fn: async () => {
            const e = await CreateDraftElection(C(), A(), Spec('Wire 3 of 3', [PersonaVoter(C(), 'member1', 0), PersonaVoter(C(), 'member2', 1), PersonaVoter(C(), 'member3', 2)]));
            made.push(e);
            const ceremony = Ok('ceremony', await A().Call(new VotingCreateTrusteeKeysOperation(), { ElectionID: e.ElectionID, TrusteePersonIDs: TRUSTEE_KEYS.map(personID), Threshold: 3 }));
            const s = ceremony.Shares ?? [];
            AssertEqual(s.length, 3, 'three shares');
            await e.GoLive();
            await CastAll(e, [{ 'Tier B motion': ['Yes'] }, { 'Tier B motion': ['No'] }, { 'Tier B motion': ['No'] }]);
            await e.Close();
            const send = async (key: PersonaKey) => Submit(await C().As(key), e.ElectionID, ShareOf(key, s).ShareIndex, ShareOf(key, s).Share);
            AssertEqual(Ok('t1', await send('trustee1')).SharesRequired, 3, 'three required');
            AssertEqual(Ok('t2', await send('trustee2')).SharesReceived, 2, 'two held');
            const locked = await e.TallyAs(A(), 'three-seed');
            AssertDeclined(locked, 'trustee key shares', '2 of 3 shares');
            Assert((locked.Output?.Message ?? '').includes('2 received'), `the refusal counts two (got "${locked.Output?.Message}")`);
            AssertEqual(Ok('t3', await send('trustee3')).SharesReceived, 3, 'three held');
            const motion = e.LabelAll(Ok('tally', await e.TallyAs(A(), 'three-seed')).Contests).get('Tier B motion');
            AssertEqual(motion?.Outcome, 'Failed', '1 Yes, 2 No');
            AssertEqual(motion?.Options['No'].Votes, 2, 'No');
        },
    },
    {
        Id: `${BUNDLE}.WX9`,
        Name: 'WX9 - tier B results stay hidden until the tally, for everyone, whatever the timing request',
        Fn: async () => {
            const e = await CreateDraftElection(C(), A(), Spec('Wire tier B hidden', [PersonaVoter(C(), 'member1', 0), PersonaVoter(C(), 'member2', 1)]));
            made.push(e);
            Ok('ceremony', await A().Call(new VotingCreateTrusteeKeysOperation(), { ElectionID: e.ElectionID, TrusteePersonIDs: TRUSTEE_KEYS.map(personID), Threshold: 2 }));
            await e.GoLive();
            await CastAll(e, [{ 'Tier B motion': ['Yes'] }, { 'Tier B motion': ['Yes'] }]);
            for (const key of ['admin', 'inspector', 'member1', 'member2'] as const) {
                const res = await (await C().As(key)).Call(new VotingGetResultsOperation(), { ElectionID: e.ElectionID });
                Assert(res.Success && res.Output?.Success === true, `${key}: GetResults answers`);
                AssertEqual(res.Output?.Visible, false, `${key}: hidden while Open`);
                AssertEqual((res.Output?.Contests ?? []).length, 0, `${key}: no counts while Open`);
            }
            await e.Close();
            const closed = await e.ResultsFor(await C().As('member1'));
            AssertEqual(closed.Output?.Visible, false, 'hidden while Closed (key not yet reconstructed)');
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
        T = await CreateDraftElection(cast, admin, Spec('Wire tier B', Roll()));
        made.length = 0;
        shares = [];
        publicKey = '';
    },
    Teardown: async () => {
        if (admin) for (const e of [T, ...made]) if (e) await e.Cleanup();
        made.length = 0;
        cast = undefined;
        admin = undefined;
        T = undefined;
    },
});
