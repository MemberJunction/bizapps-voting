import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VotingContext } from '../shared/types.js';

const mocks = vi.hoisted(() => ({
    LoadElectionGraph: vi.fn(),
    FreezeRoll: vi.fn(),
    GetDriver: vi.fn(),
    Build: vi.fn(),
    Record: vi.fn(),
    Invalidate: vi.fn(),
    Events: [] as string[],
}));

vi.mock('../shared/election-graph.js', () => ({ LoadElectionGraph: mocks.LoadElectionGraph }));
vi.mock('../shared/audit.js', () => ({ ElectionAudit: { Record: mocks.Record } }));
vi.mock('../engines/voter-roll-engine.js', () => ({ VoterRollEngine: { Instance: { FreezeRoll: mocks.FreezeRoll } } }));
vi.mock('../engines/ballot-style-builder.js', () => ({
    DEFAULT_BALLOT_LANGUAGE: 'en',
    BallotStyleBuilder: { Instance: { Build: mocks.Build } },
}));
vi.mock('@mj-biz-apps/voting-core-entities-server', () => ({ ElectionTypeDriverRegistry: { Instance: { GetDriver: mocks.GetDriver } } }));
vi.mock('@mj-biz-apps/voting-engine-base', () => ({ VotingEngineBase: { Instance: {} } }));
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LocalCacheManager: { Instance: { InvalidateEntityCaches: mocks.Invalidate } } };
});

import { ElectionAdministrationEngine } from '../engines/election-administration-engine.js';

interface FakeElection {
    ID: string;
    Status: string;
    RollFrozenAt: Date | null;
    AssuranceTier: string;
    ElectionPublicKey: string | null;
    SaveResult: boolean;
    Save: () => Promise<boolean>;
    LatestResult: { CompleteMessage: string };
}

function makeElection(overrides: Partial<FakeElection> = {}): FakeElection {
    const e: FakeElection = {
        ID: 'E1',
        Status: 'Draft',
        RollFrozenAt: null,
        AssuranceTier: 'Standard',
        ElectionPublicKey: null,
        SaveResult: true,
        LatestResult: { CompleteMessage: 'refused' },
        Save: async () => {
            mocks.Events.push(`save:${e.Status}`);
            return e.SaveResult;
        },
        ...overrides,
    };
    return e;
}

function graphOf(election: FakeElection, optionCount = 2): unknown {
    return {
        Election: election,
        ElectionType: {},
        Configuration: {},
        Contests: [{ ID: 'C1', Name: 'Contest', AllowWriteIn: false }],
        OptionsByContestID: new Map([['c1', Array.from({ length: optionCount }, () => ({ Status: 'Active' }))]]),
    };
}

function makeCtx(): VotingContext {
    const scope = {
        Commit: vi.fn(async () => {
            mocks.Events.push('commit');
        }),
        Rollback: vi.fn(async () => {
            mocks.Events.push('rollback');
        }),
    };
    const provider = { BeginEntityTransaction: vi.fn(async () => {
        mocks.Events.push('begin');
        return scope;
    }) };
    return { ContextUser: {} as VotingContext['ContextUser'], Provider: provider as unknown as VotingContext['Provider'] };
}

describe('ElectionAdministrationEngine.OpenElection atomicity', () => {
    beforeEach(() => {
        Object.values(mocks).forEach((m) => { if (typeof m === 'function') m.mockReset(); });
        mocks.Events.length = 0;
        mocks.GetDriver.mockReturnValue({ driver: { ValidateBallotStyle: async () => null } });
        mocks.Build.mockResolvedValue({});
        mocks.Record.mockResolvedValue(undefined);
        mocks.Invalidate.mockResolvedValue(undefined);
        mocks.FreezeRoll.mockImplementation(async (id: string) => {
            mocks.Events.push('freeze');
            return { Success: true, Value: { VoterCount: 3, RollHash: 'h', Unmatched: [] } };
        });
    });

    it('a readiness refusal neither freezes the roll nor opens a transaction', async () => {
        const election = makeElection();
        mocks.LoadElectionGraph.mockResolvedValue({ Success: true, Value: graphOf(election, 0) });
        const result = await ElectionAdministrationEngine.Instance.OpenElection('E1', makeCtx());
        expect(result).toMatchObject({ Success: false, Code: 'NotReady' });
        expect(mocks.FreezeRoll).not.toHaveBeenCalled();
        expect(mocks.Events).toEqual([]);
    });

    it('a ballot-style refusal neither freezes the roll nor opens a transaction', async () => {
        mocks.GetDriver.mockReturnValue({ driver: { ValidateBallotStyle: async () => 'bad style' } });
        mocks.LoadElectionGraph.mockResolvedValue({ Success: true, Value: graphOf(makeElection()) });
        const result = await ElectionAdministrationEngine.Instance.OpenElection('E1', makeCtx());
        expect(result).toMatchObject({ Success: false, Code: 'InvalidBallotStyle' });
        expect(mocks.FreezeRoll).not.toHaveBeenCalled();
        expect(mocks.Events).toEqual([]);
    });

    it('freezes and opens inside one transaction and commits once', async () => {
        const election = makeElection();
        mocks.LoadElectionGraph.mockResolvedValue({ Success: true, Value: graphOf(election) });
        const result = await ElectionAdministrationEngine.Instance.OpenElection('E1', makeCtx());
        expect(result).toEqual({ Success: true, Value: { Status: 'Open' } });
        expect(mocks.Events).toEqual(['begin', 'freeze', 'save:Ready', 'save:Open', 'commit']);
        expect(mocks.Invalidate).toHaveBeenCalledWith('MJ_BizApps_Voting: Elections');
    });

    it('rolls the freeze back when the open save is refused after the roll was frozen', async () => {
        const election = makeElection();
        mocks.LoadElectionGraph.mockResolvedValue({ Success: true, Value: graphOf(election) });
        election.SaveResult = false;
        const result = await ElectionAdministrationEngine.Instance.OpenElection('E1', makeCtx());
        expect(result).toMatchObject({ Success: false, Code: 'TransitionRefused' });
        expect(mocks.Events).toEqual(['begin', 'freeze', 'save:Ready', 'rollback']);
        expect(mocks.Events).not.toContain('commit');
    });

    it('rolls back when the freeze itself is refused', async () => {
        mocks.LoadElectionGraph.mockResolvedValue({ Success: true, Value: graphOf(makeElection()) });
        mocks.FreezeRoll.mockResolvedValue({ Success: false, Code: 'EmptyRoll', ErrorMessage: 'no voters' });
        const result = await ElectionAdministrationEngine.Instance.OpenElection('E1', makeCtx());
        expect(result).toMatchObject({ Success: false, Code: 'EmptyRoll' });
        expect(mocks.Events).toEqual(['begin', 'rollback']);
    });

    it('rolls back when a write throws', async () => {
        mocks.LoadElectionGraph.mockResolvedValue({ Success: true, Value: graphOf(makeElection()) });
        mocks.FreezeRoll.mockRejectedValue(new Error('db down'));
        const result = await ElectionAdministrationEngine.Instance.OpenElection('E1', makeCtx());
        expect(result).toMatchObject({ Success: false, Code: 'OpenFailed' });
        expect(mocks.Events).toEqual(['begin', 'rollback']);
    });

    it('does not freeze again when the roll is already frozen', async () => {
        const election = makeElection({ Status: 'Ready', RollFrozenAt: new Date() });
        mocks.LoadElectionGraph.mockResolvedValue({ Success: true, Value: graphOf(election) });
        const result = await ElectionAdministrationEngine.Instance.OpenElection('E1', makeCtx());
        expect(result.Success).toBe(true);
        expect(mocks.FreezeRoll).not.toHaveBeenCalled();
        expect(mocks.Events).toEqual(['begin', 'save:Open', 'commit']);
    });

    it('drops cached election views after a close, and not when the close is refused', async () => {
        const ctx = makeCtx();
        const election = makeElection({ Status: 'Open' });
        (ctx.Provider as unknown as { GetEntityObject: () => Promise<unknown> }).GetEntityObject = async () => ({
            ...election,
            Load: async () => true,
            Save: election.Save,
            get Status() { return election.Status; },
            set Status(v: string) { election.Status = v; },
            ID: 'E1',
        });
        const ok = await ElectionAdministrationEngine.Instance.CloseElection('E1', ctx);
        expect(ok.Success).toBe(true);
        expect(mocks.Invalidate).toHaveBeenCalledTimes(1);

        mocks.Invalidate.mockClear();
        election.Status = 'Open';
        election.SaveResult = false;
        const refused = await ElectionAdministrationEngine.Instance.CloseElection('E1', ctx);
        expect(refused.Success).toBe(false);
        expect(mocks.Invalidate).not.toHaveBeenCalled();
    });
});

describe('ElectionAdministrationEngine.OpenNominations freezes the roll atomically', () => {
    /** An office contest with no candidates yet: what a nominations election looks like. */
    function officeGraphOf(election: FakeElection): unknown {
        return {
            Election: { ...election, NominationsCloseAt: null, Save: election.Save, get Status() { return election.Status; }, set Status(v: string) { election.Status = v; } },
            ElectionType: {},
            Configuration: {},
            Contests: [{ ID: 'C1', Name: 'Chair', Kind: 'Office', AllowWriteIn: false }],
            OptionsByContestID: new Map([['c1', []]]),
        };
    }

    beforeEach(() => {
        Object.values(mocks).forEach((m) => { if (typeof m === 'function') m.mockReset(); });
        mocks.Events.length = 0;
        mocks.Record.mockResolvedValue(undefined);
        mocks.Invalidate.mockResolvedValue(undefined);
        mocks.FreezeRoll.mockImplementation(async () => {
            mocks.Events.push('freeze');
            return { Success: true, Value: { VoterCount: 3, RollHash: 'h', Unmatched: [] } };
        });
    });

    it('freezes an unfrozen roll and opens nominations in one transaction (voters can then be authorized against the roll)', async () => {
        const election = makeElection();
        mocks.LoadElectionGraph.mockImplementation(async () => ({ Success: true, Value: officeGraphOf(election) }));
        const result = await ElectionAdministrationEngine.Instance.OpenNominations('E1', makeCtx());
        expect(result).toEqual({ Success: true, Value: { Status: 'Nominations' } });
        expect(mocks.Events).toEqual(['begin', 'freeze', 'save:Nominations', 'commit']);
        expect(mocks.Invalidate).toHaveBeenCalledWith('MJ_BizApps_Voting: Eligible Voters');
    });

    it('leaves the election in Draft when the freeze is refused', async () => {
        const election = makeElection();
        mocks.LoadElectionGraph.mockImplementation(async () => ({ Success: true, Value: officeGraphOf(election) }));
        mocks.FreezeRoll.mockResolvedValue({ Success: false, Code: 'EmptyRoll', ErrorMessage: 'no voters' });
        const result = await ElectionAdministrationEngine.Instance.OpenNominations('E1', makeCtx());
        expect(result).toMatchObject({ Success: false, Code: 'EmptyRoll' });
        expect(mocks.Events).toEqual(['begin', 'rollback']);
        expect(election.Status).toBe('Draft');
    });

    it('rolls the freeze back when the status move is refused', async () => {
        const election = makeElection({ SaveResult: false });
        mocks.LoadElectionGraph.mockImplementation(async () => ({ Success: true, Value: officeGraphOf(election) }));
        const result = await ElectionAdministrationEngine.Instance.OpenNominations('E1', makeCtx());
        expect(result).toMatchObject({ Success: false, Code: 'TransitionRefused' });
        expect(mocks.Events).toEqual(['begin', 'freeze', 'save:Nominations', 'rollback']);
    });

    it('does not freeze again (and needs no transaction) when the roll is already frozen', async () => {
        const election = makeElection({ RollFrozenAt: new Date() });
        mocks.LoadElectionGraph.mockImplementation(async () => ({ Success: true, Value: officeGraphOf(election) }));
        const result = await ElectionAdministrationEngine.Instance.OpenNominations('E1', makeCtx());
        expect(result.Success).toBe(true);
        expect(mocks.FreezeRoll).not.toHaveBeenCalled();
        expect(mocks.Events).toEqual(['save:Nominations']);
    });
});
