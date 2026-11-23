/**
 * Named roll-call reads (V1 — Open-secrecy elections only):
 * - Pure policy checks (RollCallRefusal, VotesFromSubmissions, VotesFromSelectionRows, AssembleRollCall)
 * - ResultsEngine.GetRollCall against stubbed providers: refused for Confidential and Secret without touching
 *   any ballot-box or attribution table; decrypts counted attributed ballots while Open (and respects revotes);
 *   reads Ballot Selections after Tallied.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { BallotSubmission } from '@mj-biz-apps/voting-entities';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-00000000aaaa';
vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: { Instance: { GetSystemUser: () => ({ ID: SYSTEM_USER_ID, Name: 'System' }) } },
}));

const mockLoadElectionGraph = vi.fn();
vi.mock('../shared/election-graph.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../shared/election-graph.js')>();
    return {
        ...actual,
        LoadElectionGraph: (...args: unknown[]) => mockLoadElectionGraph(...args),
    };
});

const mockAuditRecord = vi.fn();
vi.mock('../shared/audit.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../shared/audit.js')>();
    return {
        ...actual,
        ElectionAudit: { Record: (...args: unknown[]) => mockAuditRecord(...args) },
    };
});

import { EncryptSelections } from '../crypto/selection-crypto.js';
import type { ElectionGraph } from '../shared/election-graph.js';
import type { VotingContext } from '../shared/types.js';
import {
    AssembleRollCall,
    RollCallRefusal,
    UsesMaterializedSelections,
    VotesFromSelectionRows,
    VotesFromSubmissions,
} from '../engines/roll-call-policy.js';
import { ResultsEngine } from '../engines/results-engine.js';

const E1 = '11111111-1111-1111-1111-111111111111';
const C1 = '22222222-2222-2222-2222-222222222222';
const C2 = '22222222-2222-2222-2222-222222222223';
const OPT_YES = '33333333-3333-3333-3333-333333333331';
const OPT_NO = '33333333-3333-3333-3333-333333333332';
const V1 = '44444444-4444-4444-4444-444444444441';
const V2 = '44444444-4444-4444-4444-444444444442';
const V3 = '44444444-4444-4444-4444-444444444443';
const P1 = '55555555-5555-5555-5555-555555555551';
const P2 = '55555555-5555-5555-5555-555555555552';
const P3 = '55555555-5555-5555-5555-555555555553';
const PART1 = '66666666-6666-6666-6666-666666666661';
const PART2 = '66666666-6666-6666-6666-666666666662';
const B_OLD = '77777777-7777-7777-7777-777777777770';
const B1 = '77777777-7777-7777-7777-777777777771';
const B2 = '77777777-7777-7777-7777-777777777772';
const CHAIR = '88888888-8888-8888-8888-888888888881';

function fakeGraph(
    overrides: { SecrecyMode?: string; Status?: string; RollFrozenAt?: Date | null; AssuranceTier?: string; ResultsTiming?: string } = {}
): ElectionGraph {
    return {
        Election: {
            ID: E1,
            SecrecyMode: overrides.SecrecyMode ?? 'Open',
            Status: overrides.Status ?? 'Open',
            RollFrozenAt: 'RollFrozenAt' in overrides ? overrides.RollFrozenAt : new Date('2026-11-20T12:00:00Z'),
            AssuranceTier: overrides.AssuranceTier ?? 'Standard',
            ResultsTiming: overrides.ResultsTiming ?? 'AdministratorsOnly',
            ElectionPublicKey: null,
        } as unknown as ElectionGraph['Election'],
        ElectionType: { ID: 'type-1', Code: 'motion' } as unknown as ElectionGraph['ElectionType'],
        Configuration: {},
        Contests: [{ ID: C1, Name: 'Motion 1', Sequence: 1 } as unknown as ElectionGraph['Contests'][number]],
        OptionsByContestID: new Map(),
        ContestTallyCodes: {},
        ContestVotingClassFilters: {},
    };
}

function stubProvider(tables: Record<string, unknown[]>): { Provider: VotingContext['Provider']; Touched: string[] } {
    const touched: string[] = [];
    const provider = {
        RunView: vi.fn(async (params: { EntityName: string }) => {
            touched.push(params.EntityName);
            return { Success: true, Results: tables[params.EntityName] ?? [] };
        }),
        RunViews: vi.fn(),
    };
    return { Provider: provider as unknown as VotingContext['Provider'], Touched: touched };
}

beforeEach(() => {
    vi.clearAllMocks();
    mockAuditRecord.mockResolvedValue(undefined);
});

describe('RollCallRefusal', () => {
    const frozen = new Date('2026-11-20T12:00:00Z');

    it('refuses Confidential and Secret unconditionally', () => {
        expect(RollCallRefusal('Confidential', 'Open', frozen, 'Standard', 'Live')?.Code).toBe('NotOpenBallot');
        expect(RollCallRefusal('Confidential', 'Tallied', frozen, 'Standard', 'AfterClose')?.Code).toBe('NotOpenBallot');
        expect(RollCallRefusal('Secret', 'Open', frozen, 'Standard', 'AdministratorsOnly')?.Code).toBe('NotOpenBallot');
        expect(RollCallRefusal('Secret', 'Certified', frozen, 'Standard', 'AfterClose')?.Code).toBe('NotOpenBallot');
    });

    it('refuses an unfrozen roll and non-Standard assurance tiers', () => {
        expect(RollCallRefusal('Open', 'Draft', null, 'Standard', 'Live')?.Code).toBe('RollNotFrozen');
        expect(RollCallRefusal('Open', 'Open', frozen, 'HighAssurance', 'Live')?.Code).toBe('TierNotSupported');
        expect(RollCallRefusal('Open', 'Tallied', frozen, 'Verifiable', 'AfterClose')?.Code).toBe('TierNotSupported');
    });

    it('refuses pre-tally reads when ResultsTiming is AfterClose or AfterVoting, and allows Live and AdministratorsOnly', () => {
        for (const status of ['Ready', 'Open', 'Closed']) {
            expect(RollCallRefusal('Open', status, frozen, 'Standard', 'AfterClose')?.Code).toBe('ResultsNotVisible');
            expect(RollCallRefusal('Open', status, frozen, 'Standard', 'AfterVoting')?.Code).toBe('ResultsNotVisible');
            expect(RollCallRefusal('Open', status, frozen, 'Standard', 'Live')).toBeNull();
            expect(RollCallRefusal('Open', status, frozen, 'Standard', 'AdministratorsOnly')).toBeNull();
        }
    });

    it('allows Tallied and Certified regardless of ResultsTiming', () => {
        for (const status of ['Tallied', 'Certified']) {
            for (const timing of ['AfterClose', 'AfterVoting', 'Live', 'AdministratorsOnly']) {
                expect(RollCallRefusal('Open', status, frozen, 'Standard', timing)).toBeNull();
            }
        }
        expect(UsesMaterializedSelections('Open')).toBe(false);
        expect(UsesMaterializedSelections('Closed')).toBe(false);
        expect(UsesMaterializedSelections('Tallied')).toBe(true);
        expect(UsesMaterializedSelections('Certified')).toBe(true);
    });
});

describe('AssembleRollCall (pure)', () => {
    const voters = [
        { ID: V1, PersonID: P1, SourceKey: 'm-1', VotingClass: 'voting-member', Weight: 1 },
        { ID: V2, PersonID: P2, SourceKey: 'm-2', VotingClass: 'voting-member', Weight: 1 },
        { ID: V3, PersonID: P3, SourceKey: 'm-3', VotingClass: 'observer', Weight: 1 },
    ];
    const participations = [
        { ID: PART1, EligibleVoterID: V1, Channel: 'InPerson' as const, EnteredByUserID: CHAIR, CastAt: '2026-11-20T15:00:00.000Z' },
        { ID: PART2, EligibleVoterID: V2, Channel: 'Online' as const, EnteredByUserID: null, CastAt: '2026-11-20T15:05:00.000Z' },
    ];
    // PART1 revoted: B1 (Counted) deliberately precedes B_OLD (Superseded) so ignoring Superseded is proven, not order-dependent.
    const attributions = [
        { ParticipationID: PART1, CastBallotID: B1 },
        { ParticipationID: PART1, CastBallotID: B_OLD },
        { ParticipationID: PART2, CastBallotID: B2 },
    ];

    it('joins current counted ballots from decrypted submissions, ignores superseded ballots, and respects VotingClassFilter', () => {
        const votes = VotesFromSubmissions([
            { CastBallotID: B_OLD, Submission: { Contests: [{ ContestID: C1, Selections: [{ OptionID: OPT_NO }] }] } },
            { CastBallotID: B1, Submission: { Contests: [{ ContestID: C1, Selections: [{ OptionID: OPT_YES }] }] } },
            { CastBallotID: B2, Submission: { Contests: [{ ContestID: C1, Abstain: true, Selections: [] }] } },
        ]);

        const out = AssembleRollCall({
            Contests: [
                { ID: C1, Name: 'Motion 1', VotingClassFilter: null },
                { ID: C2, Name: 'Voting members only', VotingClassFilter: 'voting-member' },
            ],
            Voters: voters,
            Participations: participations,
            Attributions: attributions,
            CountedBallotIDs: new Set([B1.toLowerCase(), B2.toLowerCase()]),
            VotesByBallotID: votes,
        });

        expect(out).toHaveLength(2);
        expect(out[0].Entries).toHaveLength(3);
        expect(out[0].Entries[0]).toEqual({
            EligibleVoterID: V1,
            PersonID: P1,
            SourceKey: 'm-1',
            VotingClass: 'voting-member',
            Weight: 1,
            HasVoted: true,
            Abstain: false,
            Selections: [{ OptionID: OPT_YES }],
            Channel: 'InPerson',
            EnteredByUserID: CHAIR,
            CastAt: '2026-11-20T15:00:00.000Z',
        });
        expect(out[0].Entries[1]).toMatchObject({
            EligibleVoterID: V2,
            HasVoted: true,
            Abstain: true,
            Selections: [],
            Channel: 'Online',
            EnteredByUserID: null,
        });
        expect(out[0].Entries[2]).toEqual({
            EligibleVoterID: V3,
            PersonID: P3,
            SourceKey: 'm-3',
            VotingClass: 'observer',
            Weight: 1,
            HasVoted: false,
            Abstain: false,
            Selections: [],
        });
        // Contest 2 excludes observer V3
        expect(out[1].Entries.map((e) => e.EligibleVoterID)).toEqual([V1, V2]);
    });

    it('indexes materialized Ballot Selections rows identically after tally', () => {
        const votes = VotesFromSelectionRows([
            { CastBallotID: B1, ContestID: C1, ContestOptionID: OPT_YES, Rank: 1, WriteInText: null, IsAbstain: false },
            { CastBallotID: B2, ContestID: C1, ContestOptionID: null, Rank: null, WriteInText: null, IsAbstain: true },
        ]);
        const out = AssembleRollCall({
            Contests: [{ ID: C1, Name: 'Motion 1', VotingClassFilter: null }],
            Voters: voters.slice(0, 2),
            Participations: participations,
            Attributions: attributions,
            CountedBallotIDs: new Set([B1.toLowerCase(), B2.toLowerCase()]),
            VotesByBallotID: votes,
        });
        expect(out[0].Entries[0].Selections).toEqual([{ OptionID: OPT_YES, Rank: 1 }]);
        expect(out[0].Entries[1].Abstain).toBe(true);
        expect(out[0].Entries[1].Selections).toEqual([]);
    });

    it('keeps a voter who became Challenged after casting a Counted ballot, while omitting non-Eligible voters who never voted', () => {
        const votes = VotesFromSubmissions([
            { CastBallotID: B1, Submission: { Contests: [{ ContestID: C1, Selections: [{ OptionID: OPT_YES }] }] } },
        ]);
        const out = AssembleRollCall({
            Contests: [{ ID: C1, Name: 'Motion 1', VotingClassFilter: null }],
            Voters: [
                { ID: V1, PersonID: P1, SourceKey: 'm-1', VotingClass: null, Weight: 1, Status: 'Challenged' },
                { ID: V2, PersonID: P2, SourceKey: 'm-2', VotingClass: null, Weight: 1, Status: 'Eligible' },
                { ID: V3, PersonID: P3, SourceKey: 'm-3', VotingClass: null, Weight: 1, Status: 'Removed' },
            ],
            Participations: [participations[0]],
            Attributions: [{ ParticipationID: PART1, CastBallotID: B1 }],
            CountedBallotIDs: new Set([B1.toLowerCase()]),
            VotesByBallotID: votes,
        });
        expect(out[0].Entries.map((e) => e.EligibleVoterID)).toEqual([V1, V2]);
        expect(out[0].Entries[0].HasVoted).toBe(true);
        expect(out[0].Entries[0].Selections).toEqual([{ OptionID: OPT_YES }]);
        expect(out[0].Entries[1].HasVoted).toBe(false);
    });
});

describe('ResultsEngine.GetRollCall', () => {
    const callerUser = { ID: CHAIR } as unknown as UserInfo;

    it('refuses Confidential and Secret without touching roll, poll book, attributions, or ballot box', async () => {
        for (const mode of ['Confidential', 'Secret']) {
            mockLoadElectionGraph.mockResolvedValueOnce({ Success: true, Value: fakeGraph({ SecrecyMode: mode, ResultsTiming: 'Live' }) });
            const { Provider, Touched } = stubProvider({});
            const res = await ResultsEngine.Instance.GetRollCall(E1, { ContextUser: callerUser, Provider });
            expect(res.Success).toBe(false);
            if (!res.Success) expect(res.Code).toBe('NotOpenBallot');
            expect(Touched).toEqual([]);
            expect(mockAuditRecord).not.toHaveBeenCalled();
        }
    });

    it('refuses Open elections while Open or Closed when ResultsTiming is AfterClose without touching ballot tables', async () => {
        for (const status of ['Open', 'Closed']) {
            mockLoadElectionGraph.mockResolvedValueOnce({
                Success: true,
                Value: fakeGraph({ SecrecyMode: 'Open', Status: status, ResultsTiming: 'AfterClose' }),
            });
            const { Provider, Touched } = stubProvider({});
            const res = await ResultsEngine.Instance.GetRollCall(E1, { ContextUser: callerUser, Provider });
            expect(res.Success).toBe(false);
            if (!res.Success) expect(res.Code).toBe('ResultsNotVisible');
            expect(Touched).toEqual([]);
            expect(mockAuditRecord).not.toHaveBeenCalled();
        }
    });

    it('decrypts counted attributed ballots while Open when ResultsTiming allows it, reflects revote, and audits RollCallViewed', async () => {
        const graph = fakeGraph({ SecrecyMode: 'Open', Status: 'Open', ResultsTiming: 'AdministratorsOnly' });
        mockLoadElectionGraph.mockResolvedValueOnce({ Success: true, Value: graph });

        const sub1: BallotSubmission = { Contests: [{ ContestID: C1, Selections: [{ OptionID: OPT_YES }] }] };
        const sub2: BallotSubmission = { Contests: [{ ContestID: C1, Abstain: true, Selections: [] }] };
        const enc1 = await EncryptSelections(JSON.stringify(sub1), graph);
        const enc2 = await EncryptSelections(JSON.stringify(sub2), graph);

        const { Provider, Touched } = stubProvider({
            'MJ_BizApps_Voting: Eligible Voters': [
                { ID: V1, PersonID: P1, SourceKey: 'mem-1', VotingClass: 'voting-member', Weight: 1 },
                { ID: V2, PersonID: P2, SourceKey: 'mem-2', VotingClass: 'voting-member', Weight: 1 },
                { ID: V3, PersonID: P3, SourceKey: 'mem-3', VotingClass: 'voting-member', Weight: 1 },
            ],
            'MJ_BizApps_Voting: Participations': [
                { ID: PART1, EligibleVoterID: V1, Channel: 'InPerson', EnteredByUserID: CHAIR, CastAt: '2026-11-20T15:00:00.000Z' },
                { ID: PART2, EligibleVoterID: V2, Channel: 'Online', EnteredByUserID: null, CastAt: '2026-11-20T15:05:00.000Z' },
            ],
            'MJ_BizApps_Voting: Cast Ballots': [
                { ID: B1, Selections: enc1 },
                { ID: B2, Selections: enc2 },
            ],
            'MJ_BizApps_Voting: Ballot Attributions': [
                { ParticipationID: PART1, CastBallotID: B1 },
                { ParticipationID: PART1, CastBallotID: B_OLD },
                { ParticipationID: PART2, CastBallotID: B2 },
            ],
        });

        const res = await ResultsEngine.Instance.GetRollCall(E1, { ContextUser: callerUser, Provider });
        expect(res.Success).toBe(true);
        if (res.Success) {
            expect(res.Value.Status).toBe('Open');
            expect(res.Value.Contests[0].Entries).toHaveLength(3);
            expect(res.Value.Contests[0].Entries[0]).toMatchObject({
                EligibleVoterID: V1,
                SourceKey: 'mem-1',
                HasVoted: true,
                Abstain: false,
                Selections: [{ OptionID: OPT_YES }],
                Channel: 'InPerson',
                EnteredByUserID: CHAIR,
            });
            expect(res.Value.Contests[0].Entries[1]).toMatchObject({
                EligibleVoterID: V2,
                HasVoted: true,
                Abstain: true,
                Selections: [],
                Channel: 'Online',
            });
            expect(res.Value.Contests[0].Entries[2]).toMatchObject({
                EligibleVoterID: V3,
                HasVoted: false,
                Selections: [],
            });
        }
        expect(Touched).not.toContain('MJ_BizApps_Voting: Ballot Selections');
        expect(mockAuditRecord).toHaveBeenCalledTimes(1);
        const [auditCtx, electionID, eventType, details] = mockAuditRecord.mock.calls[0];
        expect(auditCtx.Actor).toEqual({ UserID: CHAIR });
        expect(electionID).toBe(E1);
        expect(eventType).toBe('RollCallViewed');
        expect(details).toEqual({ Status: 'Open', ResultsTiming: 'AdministratorsOnly', Live: true });
        expect(JSON.stringify(details)).not.toContain(OPT_YES);
        expect(JSON.stringify(details)).not.toContain(V1);
    });

    it('reads materialized Ballot Selections after Tallied (even for AfterClose) without decrypting Cast Ballots and audits RollCallViewed', async () => {
        const graph = fakeGraph({ SecrecyMode: 'Open', Status: 'Tallied', ResultsTiming: 'AfterClose' });
        mockLoadElectionGraph.mockResolvedValueOnce({ Success: true, Value: graph });

        const { Provider, Touched } = stubProvider({
            'MJ_BizApps_Voting: Eligible Voters': [
                { ID: V1, PersonID: P1, SourceKey: 'mem-1', VotingClass: 'voting-member', Weight: 1 },
            ],
            'MJ_BizApps_Voting: Participations': [
                { ID: PART1, EligibleVoterID: V1, Channel: 'InPerson', EnteredByUserID: CHAIR, CastAt: '2026-11-20T15:00:00.000Z' },
            ],
            // No Selections ciphertext provided on Cast Ballots — proves decryption was not attempted.
            'MJ_BizApps_Voting: Cast Ballots': [{ ID: B1 }],
            'MJ_BizApps_Voting: Ballot Attributions': [{ ParticipationID: PART1, CastBallotID: B1 }],
            'MJ_BizApps_Voting: Ballot Selections': [
                { CastBallotID: B1, ContestID: C1, ContestOptionID: OPT_NO, Rank: null, WriteInText: null, IsAbstain: false },
            ],
        });

        const res = await ResultsEngine.Instance.GetRollCall(E1, { ContextUser: callerUser, Provider });
        expect(res.Success).toBe(true);
        if (res.Success) {
            expect(res.Value.Status).toBe('Tallied');
            expect(res.Value.Contests[0].Entries[0].Selections).toEqual([{ OptionID: OPT_NO }]);
        }
        expect(Touched).toContain('MJ_BizApps_Voting: Ballot Selections');
        expect(mockAuditRecord).toHaveBeenCalledTimes(1);
        expect(mockAuditRecord.mock.calls[0][2]).toBe('RollCallViewed');
        expect(mockAuditRecord.mock.calls[0][3]).toEqual({ Status: 'Tallied', ResultsTiming: 'AfterClose', Live: false });
    });
});
