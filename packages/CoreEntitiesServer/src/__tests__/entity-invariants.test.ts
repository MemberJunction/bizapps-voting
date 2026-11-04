/**
 * Tests for the pure decision helpers behind the entity server classes, plus
 * EntityLifecyclePolicyEngine WriteAuthority gates and CrossEntityPolicyEngine batch memoization.
 * The state machine and lock rule are tested in @mj-biz-apps/voting-entities; here they are only used.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    BaseEntity,
    CrossEntityPolicyEngine,
    EntityInfo,
    EntityLifecyclePolicyEngine,
    ServerOperationScopeManager,
    UserInfo,
    type CrossEntityBatchItem,
    type IMetadataProvider,
} from '@memberjunction/core';
import {
    ALLOWED_TRANSITIONS,
    CanTransition,
    IsConfigurationLocked,
    VOTING_APP_DEFAULTS,
    ValidateResolvedConfiguration,
    type ElectionStatus,
} from '@mj-biz-apps/voting-entities';
import {
    AsString,
    BuildConfigurationToValidate,
    ComputeCastBallotUpdateViolations,
    ComputeLockedFieldViolations,
    ComputeVoterRollViolations,
    DeriveElectionChangeAction,
    DescribeConfigurationLockRefusal,
    DescribeResultWriteRefusal,
    DescribeVoterDeleteRefusal,
    GetAllowedLockedFieldChanges,
    ParseConfiguration,
} from '../entity-invariants.js';
import {
    CastBallotEntityServer,
    ContestEntityServer,
    ContestOptionEntityServer,
    ContestResultEntityServer,
    EligibleVoterEntityServer,
    RegisterVotingEntityPolicies,
} from '../entity-servers.js';
import {
    BALLOT_BOX_ALLOWED_OPERATIONS,
    BallotBoxWriteGuard,
    TALLY_ALLOWED_OPERATIONS,
    TallyWriteGuard,
} from '../write-guards.js';

describe('canonical contracts are used, not re-implemented', () => {
    it('the lock rule and state machine come from voting-entities', () => {
        expect(IsConfigurationLocked('Open')).toBe(true);
        expect(IsConfigurationLocked('Ready')).toBe(false);
        expect(CanTransition('Ready', 'Open')).toBe(true);
        expect(CanTransition('Draft', 'Open')).toBe(false);
        expect(ALLOWED_TRANSITIONS.Certified).toEqual([]);
    });
});

describe('ComputeLockedFieldViolations', () => {
    it('judges nothing while the configuration is unlocked', () => {
        expect(ComputeLockedFieldViolations('Draft', ['Name', 'SecrecyMode'])).toEqual([]);
        expect(ComputeLockedFieldViolations('Ready', ['ElectionPublicKey'])).toEqual([]);
    });

    it('refuses configuration fields once locked', () => {
        expect(ComputeLockedFieldViolations('Open', ['Name', 'Status'])).toEqual(['Name']);
        expect(ComputeLockedFieldViolations('Tallied', ['Name', 'SecrecyMode', 'Configuration'])).toEqual(['Name', 'SecrecyMode', 'Configuration']);
    });

    it('allows Status and ChallengeWindowEndsAt', () => {
        expect(ComputeLockedFieldViolations('Closed', ['Status', 'ChallengeWindowEndsAt'])).toEqual([]);
    });

    it('allows RollHash / RollFrozenAt only when previously null', () => {
        expect(ComputeLockedFieldViolations('Open', ['RollHash', 'RollFrozenAt'])).toEqual([]);
        expect(ComputeLockedFieldViolations('Open', ['RollHash', 'RollFrozenAt'], { RollHash: null, RollFrozenAt: undefined })).toEqual([]);
        expect(ComputeLockedFieldViolations('Open', ['RollHash', 'RollFrozenAt'], { RollHash: 'abc', RollFrozenAt: new Date() })).toEqual(['RollHash', 'RollFrozenAt']);
    });

    it('refuses ElectionPublicKey in every locked status (it may change only before Open)', () => {
        for (const status of ['Open', 'Closed', 'Tallied', 'Certified', 'Cancelled']) {
            expect(ComputeLockedFieldViolations(status, ['ElectionPublicKey'])).toEqual(['ElectionPublicKey']);
        }
    });

    it('ignores system fields', () => {
        expect(ComputeLockedFieldViolations('Closed', ['__mj_UpdatedAt', 'Name'])).toEqual(['Name']);
    });

    it('lists the allowed set', () => {
        const allowed = GetAllowedLockedFieldChanges();
        expect(allowed.has('Status')).toBe(true);
        expect(allowed.has('Name')).toBe(false);
    });
});

describe('DeriveElectionChangeAction', () => {
    it('a new election is a Create whatever its status', () => {
        expect(DeriveElectionChangeAction(null, 'Draft', true)).toBe('Create');
        expect(DeriveElectionChangeAction(null, 'Open', true)).toBe('Create');
    });

    it('maps status changes to their action', () => {
        expect(DeriveElectionChangeAction('Ready', 'Open', false)).toBe('Open');
        expect(DeriveElectionChangeAction('Open', 'Closed', false)).toBe('Close');
        expect(DeriveElectionChangeAction('Draft', 'Cancelled', false)).toBe('Cancel');
        expect(DeriveElectionChangeAction('Closed', 'Tallied', false)).toBe('Tally');
        expect(DeriveElectionChangeAction('Tallied', 'Certified', false)).toBe('Certify');
    });

    it('other changes are an Update', () => {
        expect(DeriveElectionChangeAction('Draft', 'Nominations', false)).toBe('Update');
        expect(DeriveElectionChangeAction('Ready', 'Draft', false)).toBe('Update');
        expect(DeriveElectionChangeAction('Open', 'Open', false)).toBe('Update');
        expect(DeriveElectionChangeAction('Tallied', 'Tallied', false)).toBe('Update');
    });
});

describe('DescribeConfigurationLockRefusal', () => {
    it('is null while the election is unlocked', () => {
        const unlocked: ElectionStatus[] = ['Draft', 'Nominations', 'Ready'];
        for (const s of unlocked) expect(DescribeConfigurationLockRefusal(s, 'a contest', 'create')).toBeNull();
    });

    it('names the thing, the verb and the status once locked', () => {
        const locked: ElectionStatus[] = ['Open', 'Closed', 'Tallied', 'Certified', 'Cancelled'];
        for (const s of locked) {
            const msg = DescribeConfigurationLockRefusal(s, 'a contest', 'delete');
            expect(msg).toContain('delete a contest');
            expect(msg).toContain(s);
        }
    });
});

describe('ComputeVoterRollViolations', () => {
    it('judges nothing before the roll is frozen', () => {
        expect(ComputeVoterRollViolations(false, true, false, [])).toEqual([]);
        expect(ComputeVoterRollViolations(false, false, false, ['Weight', 'PersonID'])).toEqual([]);
    });

    it('a new voter on a frozen roll must be AddedAfterFreeze', () => {
        expect(ComputeVoterRollViolations(true, true, true, ['ElectionID'])).toEqual([]);
        const v = ComputeVoterRollViolations(true, true, false, ['ElectionID']);
        expect(v.map((x) => x.Field)).toEqual(['AddedAfterFreeze']);
    });

    it('an existing voter on a frozen roll may change only Status / StatusReason', () => {
        expect(ComputeVoterRollViolations(true, false, false, ['Status', 'StatusReason'])).toEqual([]);
        const v = ComputeVoterRollViolations(true, false, false, ['Status', 'Weight', 'VotingClass', '__mj_UpdatedAt']);
        expect(v.map((x) => x.Field)).toEqual(['Weight', 'VotingClass']);
    });
});

describe('DescribeVoterDeleteRefusal', () => {
    it('refuses only once the roll is frozen', () => {
        expect(DescribeVoterDeleteRefusal(false)).toBeNull();
        expect(DescribeVoterDeleteRefusal(true)).toContain('frozen');
    });
});

describe('ComputeCastBallotUpdateViolations', () => {
    it('has no violations when nothing changed', () => {
        expect(ComputeCastBallotUpdateViolations([], 'Counted', 'Counted')).toEqual([]);
    });

    it('allows Counted to Superseded or Spoiled', () => {
        expect(ComputeCastBallotUpdateViolations(['Status'], 'Counted', 'Superseded')).toEqual([]);
        expect(ComputeCastBallotUpdateViolations(['Status'], 'Counted', 'Spoiled')).toEqual([]);
    });

    it('refuses any other status move', () => {
        expect(ComputeCastBallotUpdateViolations(['Status'], 'Superseded', 'Counted')).toHaveLength(1);
        expect(ComputeCastBallotUpdateViolations(['Status'], 'Spoiled', 'Superseded')).toHaveLength(1);
        expect(ComputeCastBallotUpdateViolations(['Status'], null, 'Spoiled')).toHaveLength(1);
    });

    it('refuses changes to any other field', () => {
        const v = ComputeCastBallotUpdateViolations(['Status', 'Selections', 'ReceiptCode', '__mj_UpdatedAt'], 'Counted', 'Spoiled');
        expect(v.map((x) => x.Field)).toEqual(['Selections', 'ReceiptCode']);
    });
});

describe('DescribeResultWriteRefusal', () => {
    it('requires the tally guard', () => {
        expect(DescribeResultWriteRefusal(false, 'Closed')).toContain('tally engine');
    });

    it('requires a Closed or Tallied election', () => {
        expect(DescribeResultWriteRefusal(true, 'Closed')).toBeNull();
        expect(DescribeResultWriteRefusal(true, 'Tallied')).toBeNull();
        for (const s of ['Draft', 'Open', 'Certified', 'Cancelled'] as ElectionStatus[]) {
            expect(DescribeResultWriteRefusal(true, s)).toContain(s);
        }
        expect(DescribeResultWriteRefusal(true, null)).toContain('unknown');
    });
});

describe('ParseConfiguration', () => {
    it('treats blank as none', () => {
        expect(ParseConfiguration(null, 'x')).toEqual({ Value: undefined, Error: null });
        expect(ParseConfiguration('  ', 'x')).toEqual({ Value: undefined, Error: null });
    });

    it('parses a JSON object', () => {
        expect(ParseConfiguration<{ A: number }>('{"A":1}', 'x').Value).toEqual({ A: 1 });
    });

    it('fails closed on bad JSON or a non-object', () => {
        expect(ParseConfiguration('{oops', 'The config').Error).toContain('The config is not valid JSON');
        expect(ParseConfiguration('[1]', 'The config').Error).toContain('must be a JSON object');
        expect(ParseConfiguration('"s"', 'The config').Error).toContain('must be a JSON object');
    });
});

describe('BuildConfigurationToValidate', () => {
    const columns = {
        SecrecyMode: 'Secret' as const,
        AssuranceTier: 'Standard' as const,
        ResultsTiming: 'AfterClose' as const,
        ResultsAudience: 'Voters' as const,
        ResultsMinCast: 5,
        AllowRevote: false,
        WeightClassMinSize: 5,
    };

    it('is valid for the app defaults', () => {
        const config = BuildConfigurationToValidate(undefined, undefined, columns);
        expect(ValidateResolvedConfiguration(config)).toEqual([]);
    });

    it('lets the election columns win over the configuration JSON', () => {
        const config = BuildConfigurationToValidate({ SecrecyMode: 'Open' }, undefined, columns);
        expect(config.SecrecyMode).toBe('Secret');
        expect(config.GoverningDocumentCitation).toBe(VOTING_APP_DEFAULTS.GoverningDocumentCitation);
    });

    it('reports an inconsistent combination', () => {
        const config = BuildConfigurationToValidate(undefined, undefined, { ...columns, AllowRevote: true });
        expect(ValidateResolvedConfiguration(config)).toHaveLength(1);
        const tier = BuildConfigurationToValidate(undefined, undefined, { ...columns, AssuranceTier: 'Verifiable', ResultsTiming: 'Live' });
        expect(ValidateResolvedConfiguration(tier)).toHaveLength(1);
    });
});

describe('AsString', () => {
    it('returns strings and null for everything else', () => {
        expect(AsString('Open')).toBe('Open');
        expect(AsString(null)).toBeNull();
        expect(AsString(3)).toBeNull();
    });
});

// === Helpers for EntityLifecyclePolicyEngine and CrossEntityPolicyEngine tests ===

function buildEntityInfo(name: string, fieldNames: ReadonlyArray<string>): EntityInfo {
    const id = `entity-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    return new EntityInfo({
        ID: id,
        Name: name,
        BaseTable: name,
        BaseView: `vw${name}`,
        SchemaName: '__mj_BizAppsVoting',
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        AllowDeleteAPI: true,
        EntityFields: fieldNames.map((fieldName, idx) => ({
            ID: `${id}-f-${idx + 1}`,
            EntityID: id,
            Name: fieldName,
            Type: fieldName === 'AddedAfterFreeze' ? 'bit' : 'nvarchar',
            IsPrimaryKey: fieldName === 'ID',
            AllowsNull: fieldName !== 'ID',
            AllowUpdateAPI: fieldName !== 'ID',
            Sequence: idx + 1,
        })),
    });
}

describe('EntityLifecyclePolicyEngine WriteAuthority policies', () => {
    beforeEach(() => {
        RegisterVotingEntityPolicies();
    });

    it('registers ServerOperationOnly WriteAuthority policies for ballot-box and tally entities', () => {
        const ballotEntities = [
            'MJ_BizApps_Voting: Cast Ballots',
            'MJ_BizApps_Voting: Ballot Selections',
            'MJ_BizApps_Voting: Contest Running Tallies',
            'MJ_BizApps_Voting: Ballot Attributions',
            'MJ_BizApps_Voting: Participations',
            'MJ_BizApps_Voting: Ballot Submissions',
            'MJ_BizApps_Voting: Vote Selections',
            'MJ_BizApps_Voting: Anonymous Ballot Tokens',
        ];
        for (const entityName of ballotEntities) {
            const info = buildEntityInfo(entityName, ['ID', 'Status']);
            const policy = EntityLifecyclePolicyEngine.Instance.ResolvePolicy(info);
            expect(policy?.writeAuthority?.mode, `${entityName} mode`).toBe('ServerOperationOnly');
            expect(policy?.writeAuthority?.allowedOperations, `${entityName} allowedOperations`).toEqual([
                ...BALLOT_BOX_ALLOWED_OPERATIONS,
            ]);
        }

        const tallyEntities = [
            'MJ_BizApps_Voting: Contest Results',
            'MJ_BizApps_Voting: Contest Option Results',
            'MJ_BizApps_Voting: Contest Tallies',
        ];
        for (const entityName of tallyEntities) {
            const info = buildEntityInfo(entityName, ['ID', 'ContestID']);
            const policy = EntityLifecyclePolicyEngine.Instance.ResolvePolicy(info);
            expect(policy?.writeAuthority?.mode, `${entityName} mode`).toBe('ServerOperationOnly');
            expect(policy?.writeAuthority?.allowedOperations, `${entityName} allowedOperations`).toEqual([
                ...TALLY_ALLOWED_OPERATIONS,
            ]);
        }
    });

    it('enforces CheckWritePermissionGate and ValidateAsync via BallotBoxWriteGuard and TallyWriteGuard scopes', async () => {
        const castBallotInfo = buildEntityInfo('MJ_BizApps_Voting: Cast Ballots', ['ID', 'ElectionID', 'Status']);
        const ballot = new CastBallotEntityServer(castBallotInfo);
        ballot.NewRecord();
        const statusField = ballot.GetFieldByName('Status');
        if (statusField) statusField.Value = 'Counted';

        // Outside scope: refused by both CheckWritePermissionGate and ValidateAsync
        const gateRefusal = EntityLifecyclePolicyEngine.Instance.CheckWritePermissionGate(ballot, 'Create', undefined, true);
        expect(gateRefusal).toContain('only be created by the cast engine');

        const outsideValidation = await ballot.ValidateAsync();
        expect(outsideValidation.Success).toBe(false);
        expect(outsideValidation.Errors.map((e) => e.Message).join(' ')).toContain('only be created by the cast engine');

        // Inside BallotBoxWriteGuard: permitted
        await BallotBoxWriteGuard.RunWithBallotBoxAccess(async () => {
            expect(EntityLifecyclePolicyEngine.Instance.CheckWritePermissionGate(ballot, 'Create', undefined, true)).toBeNull();
            const insideValidation = await ballot.ValidateAsync();
            expect(insideValidation.Success).toBe(true);
        });

        // Inside TallyWriteGuard: Contest Results gate is permitted, Ballot Box gate remains refused
        const contestResultInfo = buildEntityInfo('MJ_BizApps_Voting: Contest Results', ['ID', 'ContestID']);
        const contestResult = new ContestResultEntityServer(contestResultInfo);
        contestResult.NewRecord();
        expect(EntityLifecyclePolicyEngine.Instance.CheckWritePermissionGate(contestResult, 'Create', undefined, true)).toContain(
            'only be written by the tally engine'
        );

        await TallyWriteGuard.RunWithTallyAccess(async () => {
            expect(EntityLifecyclePolicyEngine.Instance.CheckWritePermissionGate(contestResult, 'Create', undefined, true)).toBeNull();
            expect(EntityLifecyclePolicyEngine.Instance.CheckWritePermissionGate(ballot, 'Create', undefined, true)).toContain(
                'only be created by the cast engine'
            );
        });
    });
});

interface MockElectionState {
    ID: string;
    Status: ElectionStatus;
    RollFrozenAt: Date | null;
}

class MockVotingTransactionProvider {
    public TransactionScopeCacheKey: string | null = 'tx-voting-batch-epoch-1';
    public ElectionLoadCount = 0;
    public ContestLoadCount = 0;
    public ElectionState: MockElectionState = {
        ID: 'elec-100',
        Status: 'Draft',
        RollFrozenAt: null,
    };

    private readonly _electionInfo = buildEntityInfo('MJ_BizApps_Voting: Elections', ['ID', 'Status', 'RollFrozenAt']);
    private readonly _contestInfo = buildEntityInfo('MJ_BizApps_Voting: Contests', ['ID', 'ElectionID', 'Name']);
    private readonly _optionInfo = buildEntityInfo('MJ_BizApps_Voting: Contest Options', ['ID', 'ContestID', 'Label']);
    private readonly _voterInfo = buildEntityInfo('MJ_BizApps_Voting: Eligible Voters', [
        'ID',
        'ElectionID',
        'Status',
        'StatusReason',
        'Weight',
        'AddedAfterFreeze',
    ]);

    public EntityByName(name: string): EntityInfo | undefined {
        const lower = name.trim().toLowerCase();
        return [this._electionInfo, this._contestInfo, this._optionInfo, this._voterInfo].find(
            (e) => e.Name.toLowerCase() === lower
        );
    }

    public async GetEntityObject<T extends BaseEntity>(entityName: string, contextUser?: UserInfo): Promise<T> {
        const lower = entityName.trim().toLowerCase();
        if (lower === 'mj_bizapps_voting: elections') {
            const entity = new BaseEntity(this._electionInfo, this as object as IMetadataProvider);
            if (contextUser) entity.ContextCurrentUser = contextUser;
            const self = this;
            Object.defineProperty(entity, 'Status', {
                get: () => entity.GetFieldByName('Status')?.Value as ElectionStatus,
                set: (v: ElectionStatus) => {
                    const f = entity.GetFieldByName('Status');
                    if (f) f.Value = v;
                },
            });
            Object.defineProperty(entity, 'RollFrozenAt', {
                get: () => (entity.GetFieldByName('RollFrozenAt')?.Value as Date | null) ?? null,
                set: (v: Date | null) => {
                    const f = entity.GetFieldByName('RollFrozenAt');
                    if (f) f.Value = v;
                },
            });
            (entity as BaseEntity & { Load: (id: string) => Promise<boolean> }).Load = async (id: string): Promise<boolean> => {
                self.ElectionLoadCount++;
                if (id !== self.ElectionState.ID) return false;
                const idField = entity.GetFieldByName('ID');
                const statusField = entity.GetFieldByName('Status');
                const frozenField = entity.GetFieldByName('RollFrozenAt');
                if (idField) idField.Value = self.ElectionState.ID;
                if (statusField) statusField.Value = self.ElectionState.Status;
                if (frozenField) frozenField.Value = self.ElectionState.RollFrozenAt;
                return true;
            };
            return entity as T;
        }

        if (lower === 'mj_bizapps_voting: contests') {
            const contest = new ContestEntityServer(this._contestInfo, this as object as IMetadataProvider);
            if (contextUser) contest.ContextCurrentUser = contextUser;
            const self = this;
            (contest as BaseEntity & { Load: (id: string) => Promise<boolean> }).Load = async (id: string): Promise<boolean> => {
                self.ContestLoadCount++;
                const idField = contest.GetFieldByName('ID');
                const elecField = contest.GetFieldByName('ElectionID');
                if (idField) idField.Value = id;
                if (elecField) elecField.Value = self.ElectionState.ID;
                return true;
            };
            return contest as object as T;
        }

        if (lower === 'mj_bizapps_voting: contest options') {
            const option = new ContestOptionEntityServer(this._optionInfo, this as object as IMetadataProvider);
            if (contextUser) option.ContextCurrentUser = contextUser;
            return option as object as T;
        }

        const voter = new EligibleVoterEntityServer(this._voterInfo, this as object as IMetadataProvider);
        if (contextUser) voter.ContextCurrentUser = contextUser;
        return voter as object as T;
    }
}

describe('CrossEntityPolicyEngine batch memoization for Contests, Contest Options, and Eligible Voters', () => {
    const testUser = new UserInfo(null, {
        ID: 'u-voting-policy',
        Name: 'Voting Tester',
        Email: 'voting@example.com',
        IsActive: true,
    });

    beforeEach(() => {
        CrossEntityPolicyEngine.Instance.ClearProgrammaticPolicies();
        RegisterVotingEntityPolicies();
    });

    it('memoizes parent Election and Contest lookups across batch saves/deletes in a transaction and invalidates when Election mutates', async () => {
        const provider = new MockVotingTransactionProvider();
        const metadataProvider = provider as object as IMetadataProvider;

        // 1. Validate 20 Contests, 20 Contest Options, and 20 Eligible Voters in the same transaction scope
        const contests: ContestEntityServer[] = [];
        for (let i = 0; i < 20; i++) {
            const c = await provider.GetEntityObject<ContestEntityServer>('MJ_BizApps_Voting: Contests', testUser);
            c.NewRecord();
            const idF = c.GetFieldByName('ID');
            const elecF = c.GetFieldByName('ElectionID');
            const nameF = c.GetFieldByName('Name');
            if (idF) idF.Value = `contest-${i + 1}`;
            if (elecF) elecF.Value = 'elec-100';
            if (nameF) nameF.Value = `Contest ${i + 1}`;
            const res = await c.ValidateAsync();
            expect(res.Success).toBe(true);
            contests.push(c);
        }

        const options: ContestOptionEntityServer[] = [];
        for (let i = 0; i < 20; i++) {
            const opt = await provider.GetEntityObject<ContestOptionEntityServer>('MJ_BizApps_Voting: Contest Options', testUser);
            opt.NewRecord();
            const idF = opt.GetFieldByName('ID');
            const contestF = opt.GetFieldByName('ContestID');
            const labelF = opt.GetFieldByName('Label');
            if (idF) idF.Value = `opt-${i + 1}`;
            if (contestF) contestF.Value = 'contest-1';
            if (labelF) labelF.Value = `Option ${i + 1}`;
            const res = await opt.ValidateAsync();
            expect(res.Success).toBe(true);
            options.push(opt);
        }

        const voters: EligibleVoterEntityServer[] = [];
        for (let i = 0; i < 20; i++) {
            const v = await provider.GetEntityObject<EligibleVoterEntityServer>('MJ_BizApps_Voting: Eligible Voters', testUser);
            v.NewRecord();
            const idF = v.GetFieldByName('ID');
            const elecF = v.GetFieldByName('ElectionID');
            const addedF = v.GetFieldByName('AddedAfterFreeze');
            if (idF) idF.Value = `voter-${i + 1}`;
            if (elecF) elecF.Value = 'elec-100';
            if (addedF) addedF.Value = false;
            const res = await v.ValidateAsync();
            expect(res.Success).toBe(true);
            voters.push(v);
        }

        // All 60 child validations shared the memoized parent Election (1 load) and Contest (1 load)!
        expect(provider.ElectionLoadCount).toBe(1);
        expect(provider.ContestLoadCount).toBe(1);

        // PreEvaluateBatch across all 60 items also reuses the transaction scope (still 1 Election load!)
        const batchItems: CrossEntityBatchItem[] = [
            ...contests.map((Entity) => ({ Entity, Operation: 'Create' as const })),
            ...options.map((Entity) => ({ Entity, Operation: 'Create' as const })),
            ...voters.map((Entity) => ({ Entity, Operation: 'Create' as const })),
        ];
        const batchErr = await CrossEntityPolicyEngine.Instance.PreEvaluateBatch(batchItems, metadataProvider, testUser);
        expect(batchErr).toBeNull();
        expect(provider.ElectionLoadCount).toBe(1);
        expect(provider.ContestLoadCount).toBe(1);

        // 2. Mutate parent Election to 'Open' with RollFrozenAt set and notify CrossEntityPolicyEngine
        provider.ElectionState = {
            ID: 'elec-100',
            Status: 'Open',
            RollFrozenAt: new Date(),
        };
        const mutatedElection = await provider.GetEntityObject<BaseEntity>('MJ_BizApps_Voting: Elections', testUser);
        const elecIdField = mutatedElection.GetFieldByName('ID');
        if (elecIdField) elecIdField.Value = 'elec-100';
        CrossEntityPolicyEngine.Instance.NotifyEntityMutated(metadataProvider, mutatedElection, 'Update');

        // Next Contest validation re-loads the mutated Election (ElectionLoadCount -> 2) and refuses!
        const lockedContestRes = await contests[0].ValidateAsync();
        expect(lockedContestRes.Success).toBe(false);
        expect(lockedContestRes.Errors[0].Message).toContain('Open');
        expect(provider.ElectionLoadCount).toBe(2);

        // Next Contest Option validation reuses the newly cached 'Open' Election (still 2 loads!) and refuses!
        const lockedOptionRes = await options[0].ValidateAsync();
        expect(lockedOptionRes.Success).toBe(false);
        expect(lockedOptionRes.Errors[0].Message).toContain('Open');
        expect(provider.ElectionLoadCount).toBe(2);

        // Next unflagged EligibleVoter validation reuses the newly cached frozen Election (still 2 loads!) and refuses!
        const frozenVoterRes = await voters[0].ValidateAsync();
        expect(frozenVoterRes.Success).toBe(false);
        expect(frozenVoterRes.Errors[0].Source).toBe('AddedAfterFreeze');
        expect(frozenVoterRes.Errors[0].Message).toContain('AddedAfterFreeze');
        expect(provider.ElectionLoadCount).toBe(2);
    });
});
