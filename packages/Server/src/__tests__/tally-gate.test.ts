/**
 * When an election may be tallied (TallyRefusal), and the engine's behaviour around it: a re-tally of a Tallied election is
 * the deliberate recount path until a certifier signs; it demotes the previous finals and writes one new final per
 * contest in the same transaction, under the results lock, re-checking the state there; it is audited with the actor.
 * No database is reached.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VotingContext } from '../shared/types.js';

const mocks = vi.hoisted(() => ({
    LoadElectionGraph: vi.fn(),
    LoadElectionEntity: vi.fn(),
    Record: vi.fn(),
    Locks: vi.fn(),
    CertificationCount: { Value: 0 },
    PreviousFinals: [] as Array<{ ID: string; IsFinal: boolean; Save(): Promise<boolean> }>,
    Saved: [] as string[],
}));

vi.mock('../shared/election-graph.js', () => ({
    LoadElectionGraph: mocks.LoadElectionGraph,
    OptionsOf: () => [
        { ID: 'O-YES', Status: 'Active', Sequence: 1 },
        { ID: 'O-NO', Status: 'Active', Sequence: 2 },
    ],
    TallyCodeOf: () => 'majority',
    VotingClassFilterOf: () => null,
}));
vi.mock('../shared/audit.js', () => ({ ElectionAudit: { Record: mocks.Record } }));
vi.mock('../shared/system-user.js', () => ({ SystemContext: (ctx: VotingContext) => ({ ...ctx, ContextUser: { ID: 'SYSTEM' } }) }));
vi.mock('../shared/transaction-lock.js', () => ({
    AcquireTransactionLocks: mocks.Locks,
    ResultsLockResource: (id: string) => `voting:results:${id.toLowerCase()}`,
}));
vi.mock('../engines/trustee-engine.js', () => ({ TrusteeEngine: { Instance: { ClearKeyMaterial: vi.fn(), GetReconstructedKey: () => null, GetShareCount: () => 0 } } }));
vi.mock('../crypto/verifiable-tally-provider.js', () => ({ ResolveVerifiableTallyProvider: () => null }));
vi.mock('../crypto/selection-crypto.js', () => ({ DecryptSelections: vi.fn() }));
vi.mock('@mj-biz-apps/voting-core-entities-server', () => ({
    BallotBoxWriteGuard: { RunWithBallotBoxAccess: async <T>(work: () => Promise<T>) => work() },
    TallyWriteGuard: { RunWithTallyAccess: async <T>(work: () => Promise<T>) => work() },
    ElectionTypeDriverRegistry: { Instance: { GetDriver: () => ({ driver: { OnResultsTallied: vi.fn() } }) } },
}));
vi.mock('../engines/person-support.js', () => ({
    BuildResultsContext: async () => ({}),
    ErrorText: (e: unknown) => (e instanceof Error ? e.message : String(e)),
    LoadElectionEntity: mocks.LoadElectionEntity,
    SaveOrThrow: async (entity: { Save(): Promise<boolean> }, what: string) => {
        if (!(await entity.Save())) throw new Error(`${what} could not be saved`);
    },
    RunTransactional: async <T>(_ctx: VotingContext, work: () => Promise<T>) => work(),
}));
vi.mock('../shared/types.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../shared/types.js')>();
    return {
        ...actual,
        RunViewOf: () => ({
            RunView: async (params: { EntityName: string; ResultType?: string }) => {
                if (params.EntityName === 'MJ_BizApps_Voting: Election Certifications') return { Success: true, Results: [], TotalRowCount: mocks.CertificationCount.Value };
                if (params.EntityName === 'MJ_BizApps_Voting: Eligible Voters') return { Success: true, Results: [{ VotingClass: null, Weight: 1 }] };
                if (params.EntityName === 'MJ_BizApps_Voting: Contest Results') return { Success: true, Results: mocks.PreviousFinals };
                return { Success: true, Results: [] };
            },
        }),
    };
});

import { TallyEngine, TallyRefusal } from '../engines/tally-engine.js';

describe('TallyRefusal', () => {
    it('allows a Closed election and a Tallied one before any certification signature', () => {
        expect(TallyRefusal('Closed', false)).toBeNull();
        expect(TallyRefusal('Tallied', false)).toBeNull();
    });
    it('refuses a Certified election: results are final', () => {
        expect(TallyRefusal('Certified', false)?.Code).toBe('AlreadyCertified');
        expect(TallyRefusal('Certified', true)?.Message).toContain('final');
    });
    it('refuses a re-tally once a certifier has signed', () => {
        expect(TallyRefusal('Tallied', true)?.Code).toBe('CertificationInProgress');
    });
    it('refuses Cancelled and every pre-close status', () => {
        expect(TallyRefusal('Cancelled', false)?.Code).toBe('ElectionCancelled');
        for (const status of ['Draft', 'Nominations', 'Ready', 'Open']) {
            const refusal = TallyRefusal(status, false);
            expect(refusal?.Code).toBe('NotClosed');
            expect(refusal?.Message).toContain('only a Closed election can be tallied');
        }
    });
});

function election(status: string): Record<string, unknown> {
    const e: Record<string, unknown> = {
        ID: 'E1',
        Status: status,
        AssuranceTier: 'Standard',
        Save: async () => {
            mocks.Saved.push(`election:${String(e.Status)}`);
            return true;
        },
    };
    return e;
}

function ctx(): VotingContext {
    const provider = {
        GetEntityObject: async (name: string) => {
            const row: Record<string, unknown> = {
                ID: `${name}-row`,
                NewRecord: () => undefined,
                Save: async () => {
                    mocks.Saved.push(`${name.replace('MJ_BizApps_Voting: ', '')}${name.endsWith('Contest Results') ? `:final=${String(row.IsFinal)}` : ''}`);
                    return true;
                },
            };
            return row;
        },
    };
    return { ContextUser: { ID: 'ADMIN' } as unknown as VotingContext['ContextUser'], Provider: provider as unknown as VotingContext['Provider'] };
}

function graphOf(status: string): { Success: true; Value: Record<string, unknown> } {
    return {
        Success: true,
        Value: {
            Election: election(status),
            ElectionType: {},
            Configuration: {},
            Contests: [{ ID: 'C1', Name: 'Motion', Kind: 'Motion', Seats: 1, Threshold: 'Majority', CustomThreshold: null, ThresholdBasis: 'VotesCast', TieBreakMethod: 'Lot' }],
        },
    };
}

describe('TallyEngine.Tally around the gate', () => {
    beforeEach(() => {
        mocks.LoadElectionGraph.mockReset();
        mocks.LoadElectionEntity.mockReset();
        mocks.Record.mockReset();
        mocks.Locks.mockReset();
        mocks.CertificationCount.Value = 0;
        mocks.PreviousFinals.length = 0;
        mocks.Saved.length = 0;
    });

    it('re-tallies a Tallied election: previous final demoted, one new final, under the results lock, audited as a re-tally', async () => {
        mocks.LoadElectionGraph.mockResolvedValue(graphOf('Tallied'));
        mocks.LoadElectionEntity.mockResolvedValue({ ID: 'E1', Status: 'Tallied' });
        const previous = { ID: 'R-OLD', IsFinal: true, Save: async () => { mocks.Saved.push(`previous:final=${String(previous.IsFinal)}`); return true; } };
        mocks.PreviousFinals.push(previous);
        const result = await TallyEngine.Instance.Tally('E1', 'seed', ctx());
        expect(result.Success).toBe(true);
        expect(mocks.Locks).toHaveBeenCalledTimes(1);
        expect(mocks.Locks.mock.calls[0][1]).toEqual(['voting:results:e1']);
        // the demotion precedes the new final; nothing else is final
        expect(mocks.Saved.filter((s) => s.includes('final='))).toEqual(['previous:final=false', 'Contest Results:final=true']);
        // a re-tally does not touch the election row (it is already Tallied)
        expect(mocks.Saved.some((s) => s.startsWith('election:'))).toBe(false);
        expect(mocks.Record).toHaveBeenCalledTimes(1);
        expect(mocks.Record.mock.calls[0][0].ContextUser.ID).toBe('ADMIN');
        expect(mocks.Record.mock.calls[0][2]).toBe('Tallied');
        expect(mocks.Record.mock.calls[0][3]).toMatchObject({ Retally: true });
    });

    it('refuses a Certified election before any read of the ballot box or write', async () => {
        mocks.LoadElectionGraph.mockResolvedValue(graphOf('Certified'));
        const result = await TallyEngine.Instance.Tally('E1', undefined, ctx());
        expect(result).toMatchObject({ Success: false, Code: 'AlreadyCertified' });
        expect(mocks.Locks).not.toHaveBeenCalled();
        expect(mocks.Saved).toEqual([]);
        expect(mocks.Record).not.toHaveBeenCalled();
    });

    it('refuses a re-tally once a certification signature exists', async () => {
        mocks.LoadElectionGraph.mockResolvedValue(graphOf('Tallied'));
        mocks.CertificationCount.Value = 1;
        const result = await TallyEngine.Instance.Tally('E1', undefined, ctx());
        expect(result).toMatchObject({ Success: false, Code: 'CertificationInProgress' });
        expect(mocks.Saved).toEqual([]);
    });

    it('aborts without writing when the election was certified between the check and the write transaction', async () => {
        mocks.LoadElectionGraph.mockResolvedValue(graphOf('Tallied'));
        mocks.LoadElectionEntity.mockResolvedValue({ ID: 'E1', Status: 'Certified' });
        mocks.PreviousFinals.push({ ID: 'R-OLD', IsFinal: true, Save: async () => true });
        const result = await TallyEngine.Instance.Tally('E1', undefined, ctx());
        expect(result).toMatchObject({ Success: false, Code: 'AlreadyCertified' });
        expect(mocks.Saved).toEqual([]);
        expect(mocks.Record).not.toHaveBeenCalled();
    });

    it('a first tally of a Closed election moves it to Tallied in the same transaction', async () => {
        mocks.LoadElectionGraph.mockResolvedValue(graphOf('Closed'));
        mocks.LoadElectionEntity.mockResolvedValue({ ID: 'E1', Status: 'Closed' });
        const result = await TallyEngine.Instance.Tally('E1', 'seed', ctx());
        expect(result).toMatchObject({ Success: true, Value: { Status: 'Tallied' } });
        expect(mocks.Saved).toContain('election:Tallied');
        expect(mocks.Record.mock.calls[0][3]).toMatchObject({ Retally: false });
    });
});
