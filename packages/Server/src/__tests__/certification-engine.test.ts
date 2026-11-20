import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VotingContext } from '../shared/types.js';

const SYSTEM = { ID: 'SYSTEM-USER' };
const INSPECTOR = { ID: 'INSPECTOR-USER' };

interface SavedRow {
    Who: string;
    Status: string;
}

const mocks = vi.hoisted(() => ({
    LoadElectionGraph: vi.fn(),
    LoadElectionEntity: vi.fn(),
    Record: vi.fn(),
    Refresh: vi.fn(),
    OnResultsCertified: vi.fn(),
    BuildResultsContext: vi.fn(),
    AcquireTransactionLocks: vi.fn(),
    Saves: [] as SavedRow[],
}));

vi.mock('../shared/election-graph.js', () => ({ LoadElectionGraph: mocks.LoadElectionGraph }));
vi.mock('../shared/transaction-lock.js', () => ({
    AcquireTransactionLocks: mocks.AcquireTransactionLocks,
    ResultsLockResource: (id: string) => `voting:results:${id.toLowerCase()}`,
}));
vi.mock('../shared/audit.js', () => ({ ElectionAudit: { Record: mocks.Record } }));
vi.mock('../shared/cache-refresh.js', () => ({ RefreshCachedViews: mocks.Refresh }));
vi.mock('../shared/system-user.js', () => ({
    SystemContext: (ctx: VotingContext) => ({ ContextUser: SYSTEM, Provider: ctx.Provider }),
}));
vi.mock('../shared/authorization.js', () => ({ VotingAuthorization: { IsInspector: () => true, IsAdministrator: () => false } }));
vi.mock('@mj-biz-apps/voting-core-entities-server', () => ({
    ElectionTypeDriverRegistry: { Instance: { GetDriver: () => ({ driver: { OnResultsCertified: mocks.OnResultsCertified } }) } },
}));
vi.mock('../shared/types.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../shared/types.js')>();
    return {
        ...actual,
        RunViewOf: () => ({
            RunView: async (params: { ResultType?: string }) =>
                params.ResultType === 'count_only' ? { Success: true, Results: [], TotalRowCount: 0 } : { Success: true, Results: [] },
        }),
    };
});
vi.mock('../engines/person-support.js', () => ({
    BuildResultsContext: mocks.BuildResultsContext,
    ErrorText: (e: unknown) => (e instanceof Error ? e.message : String(e)),
    FindPersonForUser: async () => ({ ID: 'P-INSPECTOR', DisplayName: 'Inspector' }),
    LoadElectionEntity: mocks.LoadElectionEntity,
    LoadFinalContestResults: async () => [{ ContestID: 'C1', Outcome: 'Passed' }],
    SaveOrThrow: async (entity: { Save(): Promise<boolean> }, what: string) => {
        if (!(await entity.Save())) throw new Error(`${what} could not be saved`);
    },
    RunTransactional: async <T>(_ctx: VotingContext, work: () => Promise<T>) => work(),
}));

import { CertificationEngine } from '../engines/certification-engine.js';

/** An entity-like row that records which user saved it, and refuses an election save by a non-system user (the inspector's R-only grant). */
function row(kind: string, who: string, fields: Record<string, unknown>, refuseUnlessSystem = false): Record<string, unknown> {
    const r: Record<string, unknown> = {
        ID: `${kind}-1`,
        ...fields,
        NewRecord: () => undefined,
        Save: async () => {
            if (refuseUnlessSystem && who !== SYSTEM.ID) return false;
            mocks.Saves.push({ Who: `${kind}:${who}`, Status: String(r.Status ?? '') });
            return true;
        },
    };
    return r;
}

function makeCtx(): VotingContext {
    const provider = {
        GetEntityObject: async (entityName: string, user: { ID: string }) =>
            row(entityName.endsWith('Certifiers') ? 'certifier' : 'certification', user.ID, {}),
    };
    return { ContextUser: INSPECTOR as unknown as VotingContext['ContextUser'], Provider: provider as unknown as VotingContext['Provider'] };
}

describe('CertificationEngine.Certify by an Election Inspector', () => {
    beforeEach(() => {
        Object.values(mocks).forEach((m) => { if (typeof m === 'function') m.mockReset(); });
        mocks.Saves.length = 0;
        const callerElection = row('election', INSPECTOR.ID, { ID: 'E1', Status: 'Tallied', RollHash: 'roll', ResultsTiming: 'AfterClose', ResultsAudience: 'Voters', SecrecyMode: 'Secret', AssuranceTier: 'Standard', ResultsMinCast: 0, ChallengeWindowEndsAt: null }, true);
        mocks.LoadElectionGraph.mockResolvedValue({ Success: true, Value: { Election: callerElection, ElectionType: {}, Configuration: {}, Contests: [{ ID: 'C1', Name: 'Motion' }] } });
        mocks.LoadElectionEntity.mockImplementation(async (_id: string, ctx: VotingContext) => row('election', (ctx.ContextUser as unknown as { ID: string }).ID, { ID: 'E1', Status: 'Tallied' }, true));
        mocks.BuildResultsContext.mockResolvedValue({});
    });

    it('signs as the inspector and moves the election to Certified as the system principal', async () => {
        const result = await CertificationEngine.Instance.Certify('E1', 'notes', makeCtx());
        expect(result).toMatchObject({ Success: true, Value: { Status: 'Certified', SignaturesReceived: 1, SignaturesRequired: 1 } });
        expect(mocks.Saves).toEqual([
            { Who: 'certification:INSPECTOR-USER', Status: 'Draft' },
            { Who: 'certifier:INSPECTOR-USER', Status: '' },
            { Who: 'certification:INSPECTOR-USER', Status: 'Certified' },
            { Who: 'election:SYSTEM-USER', Status: 'Certified' },
        ]);
        expect(mocks.LoadElectionEntity.mock.calls[0][1].ContextUser).toBe(SYSTEM);
        // serialized with the tally: the results lock is taken first, inside the certification transaction
        expect(mocks.AcquireTransactionLocks).toHaveBeenCalledTimes(1);
        expect(mocks.AcquireTransactionLocks.mock.calls[0][1]).toEqual(['voting:results:e1']);
        expect(mocks.OnResultsCertified).toHaveBeenCalledTimes(1);
        expect(mocks.BuildResultsContext.mock.calls[0][0].Election.Status).toBe('Certified');
        expect(mocks.Refresh).toHaveBeenCalledWith(['MJ_BizApps_Voting: Elections', 'MJ_BizApps_Voting: Election Certifications']);
        // the audit event is recorded as the signer, not as the system user
        expect(mocks.Record.mock.calls[0][0].ContextUser).toBe(INSPECTOR);
        expect(mocks.Record.mock.calls[0][2]).toBe('Certified');
    });

    it('refuses to sign when a re-check under the results lock finds the election no longer Tallied', async () => {
        mocks.LoadElectionEntity.mockImplementation(async (_id: string, ctx: VotingContext) => row('election', (ctx.ContextUser as unknown as { ID: string }).ID, { ID: 'E1', Status: 'Cancelled' }, true));
        const result = await CertificationEngine.Instance.Certify('E1', 'notes', makeCtx());
        expect(result).toMatchObject({ Success: false, Code: 'CertifyFailed' });
        expect(mocks.Saves).toEqual([]);
    });
});
