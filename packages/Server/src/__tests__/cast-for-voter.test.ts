/**
 * Host entry of an in-person / paper / proxy ballot in one engine call (V3 — CastEngine.CastForVoter):
 * - Validates input (voter locator, channel != Online, entering user required)
 * - Resolves the roll entry by EligibleVoterID or SourceKey
 * - Builds the voter's ballot style hash automatically and delegates to Cast with EnteredByUserID
 * - Records BallotEntered audit event naming the entering user as ActorUserID, with no receipt/ballot/selection content.
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

const mockBuildStyle = vi.fn();
vi.mock('../engines/ballot-style-builder.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../engines/ballot-style-builder.js')>();
    return {
        ...actual,
        BallotStyleBuilder: { Instance: { Build: (...args: unknown[]) => mockBuildStyle(...args) } },
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

import type { VotingContext } from '../shared/types.js';
import { CastEngine, ValidateCastForVoterInput } from '../engines/cast-engine.js';

const E1 = '11111111-1111-1111-1111-111111111111';
const C1 = '22222222-2222-2222-2222-222222222222';
const OPT_YES = '33333333-3333-3333-3333-333333333331';
const V1 = '44444444-4444-4444-4444-444444444441';
const CHAIR_ID = '88888888-8888-8888-8888-888888888881';
const SUBMISSION: BallotSubmission = { Contests: [{ ContestID: C1, Selections: [{ OptionID: OPT_YES }] }] };

const chairUser = { ID: CHAIR_ID, Name: 'Committee Chair' } as unknown as UserInfo;
const systemUser = { ID: SYSTEM_USER_ID, Name: 'System' } as unknown as UserInfo;

function fakeGraph(overrides: { AllowRevote?: boolean; SecrecyMode?: string } = {}) {
    return {
        Election: {
            ID: E1,
            SecrecyMode: overrides.SecrecyMode ?? 'Open',
            Status: 'Open',
            AllowRevote: overrides.AllowRevote ?? true,
        },
        ElectionType: { ID: 'type-1', Code: 'motion' },
        Configuration: {},
        Contests: [{ ID: C1, Name: 'Motion 1', Sequence: 1 }],
        OptionsByContestID: new Map(),
        ContestTallyCodes: {},
        ContestVotingClassFilters: {},
    };
}

function makeProvider(tables: {
    voters?: Array<{ ID: string; VotingClass: string | null }>;
    participations?: Array<{ ID: string; Channel: string; CastAt: Date }>;
    voterObj?: Record<string, unknown>;
} = {}): VotingContext['Provider'] {
    return {
        GetEntityObject: vi.fn(async () => tables.voterObj ?? null),
        RunView: vi.fn(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ_BizApps_Voting: Participations') {
                return { Success: true, Results: tables.participations ?? [] };
            }
            return { Success: true, Results: tables.voters ?? [] };
        }),
        RunViews: vi.fn(),
    } as unknown as VotingContext['Provider'];
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mockLoadElectionGraph.mockResolvedValue({ Success: true, Value: fakeGraph() });
    mockBuildStyle.mockResolvedValue({ Hash: 'style-hash-abc', Contests: [] });
    mockAuditRecord.mockResolvedValue(undefined);
});

describe('ValidateCastForVoterInput', () => {
    it('requires ElectionID, a voter locator, a non-Online channel, and EnteredByUserID', () => {
        expect(ValidateCastForVoterInput({ ElectionID: '', EligibleVoterID: V1 }, CHAIR_ID)?.Code).toBe('ElectionRequired');
        expect(ValidateCastForVoterInput({ ElectionID: E1 }, CHAIR_ID)?.Code).toBe('VoterRequired');
        expect(
            ValidateCastForVoterInput({ ElectionID: E1, EligibleVoterID: V1, Channel: 'Online' as unknown as 'InPerson' }, CHAIR_ID)?.Code
        ).toBe('InvalidChannel');
        expect(ValidateCastForVoterInput({ ElectionID: E1, EligibleVoterID: V1 }, null)?.Code).toBe('EnteredByRequired');
        expect(ValidateCastForVoterInput({ ElectionID: E1, SourceKey: 'mem-1', Channel: 'InPerson' }, CHAIR_ID)).toBeNull();
    });
});

describe('CastEngine.CastForVoter', () => {
    it('resolves by SourceKey, builds style hash, delegates to Cast as system with chair EnteredByUserID, and audits without ballot content', async () => {
        const castSpy = vi.spyOn(CastEngine.Instance, 'Cast').mockResolvedValue({ Success: true, Value: { ReceiptCode: 'AAAA-BBBB-CCCC-DDDD-EEEE' } });
        const provider = {
            RunView: vi.fn(async () => ({ Success: true, Results: [{ ID: V1, VotingClass: 'voting-member' }] })),
            RunViews: vi.fn(),
        } as unknown as VotingContext['Provider'];

        const res = await CastEngine.Instance.CastForVoter(
            { ElectionID: E1, SourceKey: 'membership-42', Submission: SUBMISSION },
            { ContextUser: chairUser, Provider: provider }
        );

        expect(res).toEqual({ Success: true, Value: { ReceiptCode: 'AAAA-BBBB-CCCC-DDDD-EEEE', EligibleVoterID: V1 } });
        expect(mockBuildStyle).toHaveBeenCalledWith(expect.anything(), 'voting-member', 'en', expect.objectContaining({ ContextUser: expect.objectContaining({ ID: SYSTEM_USER_ID }) }));
        expect(castSpy).toHaveBeenCalledWith(
            {
                ElectionID: E1,
                EligibleVoterID: V1,
                BallotStyleHash: 'style-hash-abc',
                Submission: SUBMISSION,
                Channel: 'InPerson',
                ProxyDesignationID: undefined,
                EnteredByUserID: CHAIR_ID,
                Language: 'en',
            },
            expect.objectContaining({
                ContextUser: expect.objectContaining({ ID: SYSTEM_USER_ID }),
                Actor: { UserID: CHAIR_ID },
            })
        );
        expect(mockAuditRecord).toHaveBeenCalledTimes(1);
        const [auditCtx, electionID, eventType, details] = mockAuditRecord.mock.calls[0];
        expect(auditCtx.ContextUser.ID).toBe(SYSTEM_USER_ID);
        expect(auditCtx.Actor).toEqual({ UserID: CHAIR_ID });
        expect(electionID).toBe(E1);
        expect(eventType).toBe('BallotEntered');
        expect(details).toEqual({ Channel: 'InPerson', EligibleVoterID: V1 });
        // Audit payload carries zero ballot content or receipt codes.
        expect(JSON.stringify(details)).not.toContain('AAAA-BBBB');
        expect(JSON.stringify(details)).not.toContain(OPT_YES);
    });

    it('resolves by EligibleVoterID and accepts system context when Actor.UserID names the chair', async () => {
        const castSpy = vi.spyOn(CastEngine.Instance, 'Cast').mockResolvedValue({ Success: true, Value: { ReceiptCode: '1111-2222-3333-4444-5555' } });
        const voterObj = {
            ID: V1,
            ElectionID: E1,
            Status: 'Eligible',
            VotingClass: 'voting-member',
            SourceKey: 'membership-42',
            Load: vi.fn(async () => true),
        };
        const provider = makeProvider({ voterObj });

        const res = await CastEngine.Instance.CastForVoter(
            { ElectionID: E1, EligibleVoterID: V1, Submission: SUBMISSION },
            { ContextUser: systemUser, Provider: provider, Actor: { UserID: CHAIR_ID } }
        );

        expect(res.Success).toBe(true);
        expect(castSpy).toHaveBeenCalledWith(expect.objectContaining({ EligibleVoterID: V1, EnteredByUserID: CHAIR_ID }), expect.anything());
    });

    it('refuses plain system context with no Actor and no EnteredByUserID', async () => {
        const provider = { RunView: vi.fn(), RunViews: vi.fn() } as unknown as VotingContext['Provider'];
        const res = await CastEngine.Instance.CastForVoter(
            { ElectionID: E1, EligibleVoterID: V1, Submission: SUBMISSION },
            { ContextUser: systemUser, Provider: provider }
        );
        expect(res.Success).toBe(false);
        if (!res.Success) expect(res.Code).toBe('EnteredByRequired');
        expect(mockLoadElectionGraph).not.toHaveBeenCalled();
    });

    it('refuses ambiguous SourceKey and mismatched EligibleVoterID + SourceKey', async () => {
        const ambiguousProvider = {
            RunView: vi.fn(async () => ({
                Success: true,
                Results: [
                    { ID: V1, VotingClass: null },
                    { ID: '44444444-4444-4444-4444-444444444449', VotingClass: null },
                ],
            })),
            RunViews: vi.fn(),
        } as unknown as VotingContext['Provider'];
        const ambig = await CastEngine.Instance.CastForVoter(
            { ElectionID: E1, SourceKey: 'dup-key', Submission: SUBMISSION },
            { ContextUser: chairUser, Provider: ambiguousProvider }
        );
        expect(ambig.Success).toBe(false);
        if (!ambig.Success) expect(ambig.Code).toBe('AmbiguousVoter');

        const mismatchProvider = {
            GetEntityObject: vi.fn(async () => ({
                ID: V1,
                ElectionID: E1,
                Status: 'Eligible',
                VotingClass: null,
                SourceKey: 'actual-key',
                Load: vi.fn(async () => true),
            })),
        } as unknown as VotingContext['Provider'];
        const mismatch = await CastEngine.Instance.CastForVoter(
            { ElectionID: E1, EligibleVoterID: V1, SourceKey: 'wrong-key', Submission: SUBMISSION },
            { ContextUser: chairUser, Provider: mismatchProvider }
        );
        expect(mismatch.Success).toBe(false);
        if (!mismatch.Success) expect(mismatch.Code).toBe('VoterMismatch');
        expect(mockAuditRecord).not.toHaveBeenCalled();
    });

    it('does not write an audit event when Cast refuses', async () => {
        vi.spyOn(CastEngine.Instance, 'Cast').mockResolvedValue({ Success: false, Code: 'AlreadyVoted', ErrorMessage: 'Already voted.' });
        const provider = {
            RunView: vi.fn(async () => ({ Success: true, Results: [{ ID: V1, VotingClass: null }] })),
            RunViews: vi.fn(),
        } as unknown as VotingContext['Provider'];

        const res = await CastEngine.Instance.CastForVoter(
            { ElectionID: E1, SourceKey: 'mem-1', Submission: SUBMISSION },
            { ContextUser: chairUser, Provider: provider }
        );
        expect(res.Success).toBe(false);
        if (!res.Success) expect(res.Code).toBe('AlreadyVoted');
        expect(mockAuditRecord).not.toHaveBeenCalled();
    });

    it('refuses to overwrite an existing Online participation on revote unless AllowOverrideOnline is set', async () => {
        const castSpy = vi.spyOn(CastEngine.Instance, 'Cast').mockResolvedValue({ Success: true, Value: { ReceiptCode: 'AAAA-BBBB-CCCC-DDDD-EEEE' } });
        const provider = makeProvider({
            voters: [{ ID: V1, VotingClass: 'voting-member' }],
            participations: [{ ID: 'part-online-1', Channel: 'Online', CastAt: new Date('2026-11-20T15:00:00Z') }],
        });

        const refused = await CastEngine.Instance.CastForVoter(
            { ElectionID: E1, SourceKey: 'membership-42', Submission: SUBMISSION },
            { ContextUser: chairUser, Provider: provider }
        );
        expect(refused.Success).toBe(false);
        if (!refused.Success) expect(refused.Code).toBe('OnlineOverrideNotAllowed');
        expect(castSpy).not.toHaveBeenCalled();
        expect(mockAuditRecord).not.toHaveBeenCalled();

        const allowed = await CastEngine.Instance.CastForVoter(
            { ElectionID: E1, SourceKey: 'membership-42', Submission: SUBMISSION, AllowOverrideOnline: true },
            { ContextUser: chairUser, Provider: provider }
        );
        expect(allowed.Success).toBe(true);
        expect(castSpy).toHaveBeenCalledTimes(1);
        expect(mockAuditRecord).toHaveBeenCalledWith(
            expect.objectContaining({ Actor: { UserID: CHAIR_ID } }),
            E1,
            'BallotEntered',
            { Channel: 'InPerson', EligibleVoterID: V1, OverrideOnline: true }
        );
    });

    it('returns Fail instead of throwing when LoadElectionGraph or BallotStyleBuilder throws', async () => {
        const provider = makeProvider({ voters: [{ ID: V1, VotingClass: null }] });

        mockLoadElectionGraph.mockRejectedValueOnce(new Error('db transient failure'));
        const graphErr = await CastEngine.Instance.CastForVoter(
            { ElectionID: E1, SourceKey: 'mem-1', Submission: SUBMISSION },
            { ContextUser: chairUser, Provider: provider }
        );
        expect(graphErr.Success).toBe(false);
        if (!graphErr.Success) expect(graphErr.Code).toBe('CastFailed');

        mockBuildStyle.mockRejectedValueOnce(new Error('style explosion'));
        const styleErr = await CastEngine.Instance.CastForVoter(
            { ElectionID: E1, SourceKey: 'mem-1', Submission: SUBMISSION },
            { ContextUser: chairUser, Provider: provider }
        );
        expect(styleErr.Success).toBe(false);
        if (!styleErr.Success) expect(styleErr.Code).toBe('CastFailed');
        expect(mockAuditRecord).not.toHaveBeenCalled();
    });
});
