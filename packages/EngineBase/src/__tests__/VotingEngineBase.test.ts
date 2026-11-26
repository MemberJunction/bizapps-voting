/**
 * Unit tests for VotingEngineBase.
 * Tests caching, lookup logic, active filtering, configuration parsing, active ProviderToUse,
 * user-switch invalidation, InvalidateCache, and CanRead permission gating WITHOUT a database.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { BaseEnginePropertyConfig, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { ElectionSubtypeDirectory } from '@mj-biz-apps/voting-entities';
import type {
    mjBizAppsVotingElectionTypeEntity,
    mjBizAppsVotingTallyMethodEntity,
    mjBizAppsVotingEligibilitySourceTypeEntity,
    mjBizAppsVotingVoterCredentialMethodEntity,
} from '@mj-biz-apps/voting-entities';
import { VotingEngineBase } from '../VotingEngineBase.js';
import type { IElectionTypeConfiguration } from '@mj-biz-apps/voting-entities/contracts';

interface RecordedLoadCall {
    Configs: Array<Partial<BaseEnginePropertyConfig>>;
    Provider: IMetadataProvider | undefined;
    ForceRefresh: boolean;
    ContextUser: UserInfo | undefined;
}

/**
 * Test subclass that allows injecting test data and observing Load() invocations without a database.
 */
class VotingEngineBaseForTest extends VotingEngineBase {
    public LoadCalls: RecordedLoadCall[] = [];
    public NextLoadData: {
        electionTypes?: mjBizAppsVotingElectionTypeEntity[];
        tallyMethods?: mjBizAppsVotingTallyMethodEntity[];
        eligibilitySourceTypes?: mjBizAppsVotingEligibilitySourceTypeEntity[];
        voterCredentialMethods?: mjBizAppsVotingVoterCredentialMethodEntity[];
    } = {};
    private _simulatedLoaded = false;

    public constructor() {
        super();
    }

    public override get Loaded(): boolean {
        return this._simulatedLoaded;
    }

    protected override async Load(
        configs: Array<Partial<BaseEnginePropertyConfig>>,
        provider?: IMetadataProvider,
        forceRefresh?: boolean,
        contextUser?: UserInfo
    ): Promise<void> {
        this.LoadCalls.push({
            Configs: configs,
            Provider: provider,
            ForceRefresh: Boolean(forceRefresh),
            ContextUser: contextUser,
        });

        if (forceRefresh || !this._simulatedLoaded) {
            for (const cfg of configs) {
                if (cfg.PropertyName === '_electionTypes' && this.NextLoadData.electionTypes) {
                    this.SetField('_electionTypes', this.NextLoadData.electionTypes);
                } else if (cfg.PropertyName === '_tallyMethods' && this.NextLoadData.tallyMethods) {
                    this.SetField('_tallyMethods', this.NextLoadData.tallyMethods);
                } else if (cfg.PropertyName === '_eligibilitySourceTypes' && this.NextLoadData.eligibilitySourceTypes) {
                    this.SetField('_eligibilitySourceTypes', this.NextLoadData.eligibilitySourceTypes);
                } else if (cfg.PropertyName === '_voterCredentialMethods' && this.NextLoadData.voterCredentialMethods) {
                    this.SetField('_voterCredentialMethods', this.NextLoadData.voterCredentialMethods);
                }
            }
            this._simulatedLoaded = true;
            await this.AdditionalLoading(contextUser);
        }
    }

    private SetField(name: string, value: object[]): void {
        Reflect.set(this, name, value);
    }

    public SetCachesForTest(
        electionTypes: mjBizAppsVotingElectionTypeEntity[],
        tallyMethods: mjBizAppsVotingTallyMethodEntity[],
        eligibilitySourceTypes: mjBizAppsVotingEligibilitySourceTypeEntity[],
        voterCredentialMethods: mjBizAppsVotingVoterCredentialMethodEntity[]
    ): void {
        this.SetField('_electionTypes', electionTypes);
        this.SetField('_tallyMethods', tallyMethods);
        this.SetField('_eligibilitySourceTypes', eligibilitySourceTypes);
        this.SetField('_voterCredentialMethods', voterCredentialMethods);
        this._simulatedLoaded = true;

        Reflect.set(this, '_electionTypesById', null);
        Reflect.set(this, '_electionTypesByCode', null);
        Reflect.set(this, '_tallyMethodsById', null);
        Reflect.set(this, '_tallyMethodsByCode', null);
        Reflect.set(this, '_eligibilitySourceTypesById', null);
        Reflect.set(this, '_eligibilitySourceTypesByCode', null);
        Reflect.set(this, '_voterCredentialMethodsById', null);
        Reflect.set(this, '_voterCredentialMethodsByCode', null);
    }

    public GetElectionTypesByIdMapForTest(): Map<string, mjBizAppsVotingElectionTypeEntity> | null {
        return Reflect.get(this, '_electionTypesById') as Map<string, mjBizAppsVotingElectionTypeEntity> | null;
    }
}

function createMockUser(id: string): UserInfo {
    return { ID: id, Name: `User ${id}` } as UserInfo;
}

function createMockProvider(
    userId: string,
    permissions: Record<string, boolean> = {}
): IMetadataProvider {
    const currentUser = createMockUser(userId);
    const provider = {
        CurrentUser: currentUser,
        EntityByName: vi.fn((entityName: string) => ({
            Name: entityName,
            GetUserPermisions: (_user: UserInfo) => ({
                CanRead: permissions[entityName] ?? true,
            }),
        })),
    };
    return provider as unknown as IMetadataProvider;
}

/**
 * Mock entity factory for creating test entities with minimal properties.
 */
function createMockElectionType(overrides: Partial<mjBizAppsVotingElectionTypeEntity> = {}): mjBizAppsVotingElectionTypeEntity {
    return {
        ID: '550e8400-e29b-41d4-a716-446655440000',
        Name: 'Test Election Type',
        Code: 'test-type',
        Status: 'Active',
        Configuration: null,
        Description: null,
        ServerDriverClass: null,
        UIDriverClass: null,
        ElectionExtensionEntityID: null,
        IconClass: null,
        __mj_CreatedAt: new Date(),
        __mj_UpdatedAt: new Date(),
        ElectionExtensionEntity: null,
        ...overrides,
    } as mjBizAppsVotingElectionTypeEntity;
}

function createMockTallyMethod(overrides: Partial<mjBizAppsVotingTallyMethodEntity> = {}): mjBizAppsVotingTallyMethodEntity {
    return {
        ID: '550e8400-e29b-41d4-a716-446655440001',
        Name: 'Plurality',
        Code: 'plurality',
        Status: 'Active',
        Description: null,
        __mj_CreatedAt: new Date(),
        __mj_UpdatedAt: new Date(),
        ...overrides,
    } as mjBizAppsVotingTallyMethodEntity;
}

function createMockEligibilitySourceType(
    overrides: Partial<mjBizAppsVotingEligibilitySourceTypeEntity> = {}
): mjBizAppsVotingEligibilitySourceTypeEntity {
    return {
        ID: '550e8400-e29b-41d4-a716-446655440002',
        Name: 'Entity Query',
        Code: 'entity-query',
        Status: 'Active',
        Description: null,
        __mj_CreatedAt: new Date(),
        __mj_UpdatedAt: new Date(),
        ...overrides,
    } as mjBizAppsVotingEligibilitySourceTypeEntity;
}

function createMockVoterCredentialMethod(
    overrides: Partial<mjBizAppsVotingVoterCredentialMethodEntity> = {}
): mjBizAppsVotingVoterCredentialMethodEntity {
    return {
        ID: '550e8400-e29b-41d4-a716-446655440003',
        Name: 'Emailed Link',
        Code: 'emailed-link',
        Status: 'Active',
        Description: null,
        __mj_CreatedAt: new Date(),
        __mj_UpdatedAt: new Date(),
        ...overrides,
    } as mjBizAppsVotingVoterCredentialMethodEntity;
}

describe('VotingEngineBase', () => {
    let engine: VotingEngineBaseForTest;

    beforeEach(() => {
        engine = new VotingEngineBaseForTest();
    });

    describe('Collections and Getters', () => {
        it('should return empty collections when no data is loaded', () => {
            engine.SetCachesForTest([], [], [], []);

            expect(engine.ElectionTypes).toHaveLength(0);
            expect(engine.TallyMethods).toHaveLength(0);
            expect(engine.EligibilitySourceTypes).toHaveLength(0);
            expect(engine.VoterCredentialMethods).toHaveLength(0);
        });

        it('should return all entities in ElectionTypes collection', () => {
            const type1 = createMockElectionType({ ID: 'id-1', Name: 'Type 1', Code: 'type-1' });
            const type2 = createMockElectionType({ ID: 'id-2', Name: 'Type 2', Code: 'type-2' });
            engine.SetCachesForTest([type1, type2], [], [], []);

            expect(engine.ElectionTypes).toHaveLength(2);
            expect(engine.ElectionTypes[0].Code).toBe('type-1');
            expect(engine.ElectionTypes[1].Code).toBe('type-2');
        });
    });

    describe('Election Type Lookups by ID', () => {
        beforeEach(() => {
            const type1 = createMockElectionType({ ID: '550e8400-e29b-41d4-a716-000000000001', Code: 'motion' });
            const type2 = createMockElectionType({ ID: '550e8400-e29b-41d4-a716-000000000002', Code: 'board' });
            engine.SetCachesForTest([type1, type2], [], [], []);
        });

        it('should find election type by exact ID', () => {
            const result = engine.GetElectionTypeByID('550e8400-e29b-41d4-a716-000000000001');
            expect(result).toBeDefined();
            expect(result?.Code).toBe('motion');
        });

        it('should find election type by ID with different case', () => {
            const result = engine.GetElectionTypeByID('550E8400-E29B-41D4-A716-000000000001');
            expect(result).toBeDefined();
            expect(result?.Code).toBe('motion');
        });

        it('should return undefined for non-existent ID', () => {
            const result = engine.GetElectionTypeByID('550e8400-e29b-41d4-a716-999999999999');
            expect(result).toBeUndefined();
        });

        it('should return undefined for null or empty ID', () => {
            expect(engine.GetElectionTypeByID(null)).toBeUndefined();
            expect(engine.GetElectionTypeByID(undefined)).toBeUndefined();
            expect(engine.GetElectionTypeByID('')).toBeUndefined();
        });
    });

    describe('Election Type Lookups by Code', () => {
        beforeEach(() => {
            const type1 = createMockElectionType({ ID: 'id-1', Code: 'motion' });
            const type2 = createMockElectionType({ ID: 'id-2', Code: 'board-election' });
            engine.SetCachesForTest([type1, type2], [], [], []);
        });

        it('should find election type by exact code', () => {
            const result = engine.GetElectionTypeByCode('motion');
            expect(result).toBeDefined();
            expect(result?.ID).toBe('id-1');
        });

        it('should find election type by code with different case (case-insensitive)', () => {
            const result = engine.GetElectionTypeByCode('MOTION');
            expect(result).toBeDefined();
            expect(result?.ID).toBe('id-1');
        });

        it('should find election type by code with mixed case', () => {
            const result = engine.GetElectionTypeByCode('Board-Election');
            expect(result).toBeDefined();
            expect(result?.ID).toBe('id-2');
        });

        it('should return undefined for non-existent code', () => {
            const result = engine.GetElectionTypeByCode('non-existent');
            expect(result).toBeUndefined();
        });

        it('should return undefined for null or empty code', () => {
            expect(engine.GetElectionTypeByCode(null)).toBeUndefined();
            expect(engine.GetElectionTypeByCode(undefined)).toBeUndefined();
            expect(engine.GetElectionTypeByCode('')).toBeUndefined();
        });
    });

    describe('Tally Method Lookups', () => {
        beforeEach(() => {
            const method1 = createMockTallyMethod({ ID: 'id-1', Code: 'plurality' });
            const method2 = createMockTallyMethod({ ID: 'id-2', Code: 'irv' });
            engine.SetCachesForTest([], [method1, method2], [], []);
        });

        it('should find tally method by ID', () => {
            const result = engine.GetTallyMethodByID('id-1');
            expect(result).toBeDefined();
            expect(result?.Code).toBe('plurality');
        });

        it('should find tally method by code (case-insensitive)', () => {
            const result = engine.GetTallyMethodByCode('PLURALITY');
            expect(result).toBeDefined();
            expect(result?.ID).toBe('id-1');
        });

        it('should return undefined for non-existent tally method', () => {
            expect(engine.GetTallyMethodByID('non-existent')).toBeUndefined();
            expect(engine.GetTallyMethodByCode('non-existent')).toBeUndefined();
        });
    });

    describe('Eligibility Source Type Lookups', () => {
        beforeEach(() => {
            const type1 = createMockEligibilitySourceType({ ID: 'id-1', Code: 'entity-query' });
            const type2 = createMockEligibilitySourceType({ ID: 'id-2', Code: 'csv' });
            engine.SetCachesForTest([], [], [type1, type2], []);
        });

        it('should find eligibility source type by ID', () => {
            const result = engine.GetEligibilitySourceTypeByID('id-1');
            expect(result).toBeDefined();
            expect(result?.Code).toBe('entity-query');
        });

        it('should find eligibility source type by code (case-insensitive)', () => {
            const result = engine.GetEligibilitySourceTypeByCode('ENTITY-QUERY');
            expect(result).toBeDefined();
            expect(result?.ID).toBe('id-1');
        });
    });

    describe('Voter Credential Method Lookups', () => {
        beforeEach(() => {
            const method1 = createMockVoterCredentialMethod({ ID: 'id-1', Code: 'emailed-link' });
            const method2 = createMockVoterCredentialMethod({ ID: 'id-2', Code: 'sso' });
            engine.SetCachesForTest([], [], [], [method1, method2]);
        });

        it('should find voter credential method by ID', () => {
            const result = engine.GetVoterCredentialMethodByID('id-1');
            expect(result).toBeDefined();
            expect(result?.Code).toBe('emailed-link');
        });

        it('should find voter credential method by code (case-insensitive)', () => {
            const result = engine.GetVoterCredentialMethodByCode('EMAILED-LINK');
            expect(result).toBeDefined();
            expect(result?.ID).toBe('id-1');
        });
    });

    describe('Active-Only Filtering', () => {
        beforeEach(() => {
            const activeType = createMockElectionType({ ID: 'id-1', Code: 'active', Status: 'Active' });
            const disabledType = createMockElectionType({ ID: 'id-2', Code: 'disabled', Status: 'Disabled' });
            const activeMethod = createMockTallyMethod({ ID: 'id-3', Code: 'plurality', Status: 'Active' });
            const disabledMethod = createMockTallyMethod({ ID: 'id-4', Code: 'irv', Status: 'Disabled' });
            const activeEligibility = createMockEligibilitySourceType({ ID: 'id-5', Code: 'entity-query', Status: 'Active' });
            const disabledEligibility = createMockEligibilitySourceType({ ID: 'id-6', Code: 'csv', Status: 'Disabled' });
            const activeCredential = createMockVoterCredentialMethod({ ID: 'id-7', Code: 'emailed-link', Status: 'Active' });
            const disabledCredential = createMockVoterCredentialMethod({ ID: 'id-8', Code: 'sso', Status: 'Disabled' });

            engine.SetCachesForTest(
                [activeType, disabledType],
                [activeMethod, disabledMethod],
                [activeEligibility, disabledEligibility],
                [activeCredential, disabledCredential]
            );
        });

        it('should filter to only active election types', () => {
            const active = engine.ActiveElectionTypes;
            expect(active).toHaveLength(1);
            expect(active[0].Code).toBe('active');
        });

        it('should filter to only active tally methods', () => {
            const active = engine.ActiveTallyMethods;
            expect(active).toHaveLength(1);
            expect(active[0].Code).toBe('plurality');
        });

        it('should filter to only active eligibility source types', () => {
            const active = engine.ActiveEligibilitySourceTypes;
            expect(active).toHaveLength(1);
            expect(active[0].Code).toBe('entity-query');
        });

        it('should filter to only active voter credential methods', () => {
            const active = engine.ActiveVoterCredentialMethods;
            expect(active).toHaveLength(1);
            expect(active[0].Code).toBe('emailed-link');
        });
    });

    describe('Configuration Parsing', () => {
        it('should parse valid JSON configuration', () => {
            const config: IElectionTypeConfiguration = {
                SecrecyMode: 'Secret',
                AssuranceTier: 'Standard',
                ResultsTiming: 'AfterClose',
                AllowRevote: false,
            };
            const type = createMockElectionType({
                ID: 'config-test',
                Configuration: JSON.stringify(config),
            });
            engine.SetCachesForTest([type], [], [], []);

            const result = engine.GetElectionTypeConfiguration('config-test');
            expect(result).toBeDefined();
            expect(result?.SecrecyMode).toBe('Secret');
            expect(result?.AssuranceTier).toBe('Standard');
            expect(result?.ResultsTiming).toBe('AfterClose');
            expect(result?.AllowRevote).toBe(false);
        });

        it('should parse complex nested configuration', () => {
            const config: IElectionTypeConfiguration = {
                SecrecyMode: 'Confidential',
                AllowedContestKinds: ['Motion', 'Office'],
                AllowedCredentialMethodCodes: ['emailed-link', 'sso'],
                DefaultTallyMethodCode: 'irv',
                OverridableKeys: ['AllowRevote', 'ResultsAudience'],
            };
            const type = createMockElectionType({
                ID: 'complex-config',
                Configuration: JSON.stringify(config),
            });
            engine.SetCachesForTest([type], [], [], []);

            const result = engine.GetElectionTypeConfiguration('complex-config');
            expect(result?.AllowedContestKinds).toEqual(['Motion', 'Office']);
            expect(result?.AllowedCredentialMethodCodes).toEqual(['emailed-link', 'sso']);
            expect(result?.DefaultTallyMethodCode).toBe('irv');
            expect(result?.OverridableKeys).toEqual(['AllowRevote', 'ResultsAudience']);
        });

        it('should return null for missing configuration', () => {
            const type = createMockElectionType({ ID: 'no-config', Configuration: null });
            engine.SetCachesForTest([type], [], [], []);

            const result = engine.GetElectionTypeConfiguration('no-config');
            expect(result).toBeNull();
        });

        it('should return null for non-existent type ID', () => {
            engine.SetCachesForTest([], [], [], []);
            const result = engine.GetElectionTypeConfiguration('non-existent');
            expect(result).toBeNull();
        });

        it('should return null for invalid JSON configuration', () => {
            const type = createMockElectionType({ ID: 'bad-json', Configuration: '{invalid json' });
            engine.SetCachesForTest([type], [], [], []);

            const result = engine.GetElectionTypeConfiguration('bad-json');
            expect(result).toBeNull();
        });

        it('should handle null or empty configuration string', () => {
            const typeNull = createMockElectionType({ ID: 'null-config', Configuration: null });
            const typeEmpty = createMockElectionType({ ID: 'empty-config', Configuration: '' });
            engine.SetCachesForTest([typeNull, typeEmpty], [], [], []);

            expect(engine.GetElectionTypeConfiguration('null-config')).toBeNull();
            expect(engine.GetElectionTypeConfiguration('empty-config')).toBeNull();
        });
    });

    describe('Lookup Index Memoization', () => {
        it('should cache ID lookups and reuse the map on subsequent calls', () => {
            const type1 = createMockElectionType({ ID: 'id-1', Code: 'motion' });
            engine.SetCachesForTest([type1], [], [], []);

            // First call builds the index
            const result1 = engine.GetElectionTypeByID('id-1');
            expect(result1).toBeDefined();

            // Verify the map is cached
            const cachedMap = engine.GetElectionTypesByIdMapForTest();
            expect(cachedMap).not.toBeNull();
            expect(cachedMap?.size).toBe(1);

            // Second call uses the cached map
            const result2 = engine.GetElectionTypeByID('id-1');
            expect(result2).toBe(result1);
            expect(engine.GetElectionTypesByIdMapForTest()).toBe(cachedMap);
        });

        it('should invalidate memoized indexes after SetCachesForTest', () => {
            const type1 = createMockElectionType({ ID: 'id-1', Code: 'motion' });
            engine.SetCachesForTest([type1], [], [], []);

            // Build the index
            engine.GetElectionTypeByID('id-1');
            const oldMap = engine.GetElectionTypesByIdMapForTest();
            expect(oldMap).not.toBeNull();

            // Set new caches, which should invalidate the index
            const type2 = createMockElectionType({ ID: 'id-2', Code: 'board' });
            engine.SetCachesForTest([type2], [], [], []);

            // Index should be null
            expect(engine.GetElectionTypesByIdMapForTest()).toBeNull();

            // Next lookup rebuilds it
            const result = engine.GetElectionTypeByID('id-2');
            expect(result).toBeDefined();
            expect(engine.GetElectionTypesByIdMapForTest()).not.toBeNull();
            expect(engine.GetElectionTypesByIdMapForTest()).not.toBe(oldMap);
        });
    });

    describe('O(1) Lookup Performance', () => {
        it('should perform lookups in constant time regardless of collection size', () => {
            // Create a large collection
            const types = Array.from({ length: 1000 }, (_, i) =>
                createMockElectionType({
                    ID: `id-${i}`,
                    Code: `code-${i}`
                })
            );
            engine.SetCachesForTest(types, [], [], []);

            // Lookups should be fast (testing that they work correctly for large sets)
            const firstResult = engine.GetElectionTypeByID('id-0');
            const lastResult = engine.GetElectionTypeByID('id-999');
            const middleResult = engine.GetElectionTypeByCode('code-500');

            expect(firstResult?.ID).toBe('id-0');
            expect(lastResult?.ID).toBe('id-999');
            expect(middleResult?.Code).toBe('code-500');
        });
    });

    describe('Active ProviderToUse, User-Switch Invalidation, InvalidateCache, and CanRead Gating', () => {
        it('routes ProviderToUse to the latest provider passed to Config() instead of latching the first', async () => {
            const providerA = createMockProvider('user-a');
            const providerB = createMockProvider('user-a');

            await engine.Config(false, undefined, providerA);
            expect(engine.ProviderToUse).toBe(providerA);
            expect(engine.LoadCalls[0].Provider).toBe(providerA);

            await engine.Config(false, undefined, providerB);
            expect(engine.ProviderToUse).toBe(providerB);
            expect(engine.LoadCalls[1].Provider).toBe(providerB);
        });

        it('uses CacheLocal: true on all four shared non-RLS taxonomy entities', async () => {
            const provider = createMockProvider('user-a');
            await engine.Config(false, undefined, provider);

            expect(engine.LoadCalls).toHaveLength(1);
            const configs = engine.LoadCalls[0].Configs;
            expect(configs).toHaveLength(4);
            expect(configs.map((c) => c.EntityName)).toEqual([
                'MJ_BizApps_Voting: Election Types',
                'MJ_BizApps_Voting: Tally Methods',
                'MJ_BizApps_Voting: Eligibility Source Types',
                'MJ_BizApps_Voting: Voter Credential Methods',
            ]);
            for (const cfg of configs) {
                expect(cfg.CacheLocal).toBe(true);
            }
        });

        it('forces a refresh automatically when the active user changes and tracks IsConfiguredForUser', async () => {
            const providerA = createMockProvider('user-a');
            const providerB = createMockProvider('user-b');

            expect(engine.IsConfiguredForUser('user-a')).toBe(false);

            await engine.Config(false, undefined, providerA);
            expect(engine.LoadCalls[0].ForceRefresh).toBe(false);
            expect(engine.IsConfiguredForUser('user-a')).toBe(true);
            expect(engine.IsConfiguredForUser('USER-A')).toBe(true);
            expect(engine.IsConfiguredForUser('user-b')).toBe(false);

            // Same user again: does not force refresh
            await engine.Config(false, undefined, providerA);
            expect(engine.LoadCalls[1].ForceRefresh).toBe(false);

            // Different user: automatically forces refresh
            await engine.Config(false, undefined, providerB);
            expect(engine.LoadCalls[2].ForceRefresh).toBe(true);
            expect(engine.IsConfiguredForUser('user-b')).toBe(true);
            expect(engine.IsConfiguredForUser('user-a')).toBe(false);
        });

        it('clears cached collections, lookup indexes, subtype directory, and forces next refresh on InvalidateCache()', async () => {
            const type1 = createMockElectionType({
                ID: 'type-1',
                Code: 'standards',
                ElectionExtensionEntity: 'MJ_BizApps_Voting: Standards Ballot Elections',
            });
            engine.NextLoadData = {
                electionTypes: [type1],
                tallyMethods: [createMockTallyMethod({ ID: 'tm-1', Code: 'plurality' })],
                eligibilitySourceTypes: [createMockEligibilitySourceType({ ID: 'es-1', Code: 'csv' })],
                voterCredentialMethods: [createMockVoterCredentialMethod({ ID: 'vc-1', Code: 'sso' })],
            };
            const provider = createMockProvider('user-a');

            await engine.Config(false, undefined, provider);
            expect(engine.GetElectionTypeByID('type-1')?.Code).toBe('standards');
            expect(ElectionSubtypeDirectory.Instance.Get('type-1')).toBe('MJ_BizApps_Voting: Standards Ballot Elections');
            expect(engine.IsConfiguredForUser('user-a')).toBe(true);

            engine.InvalidateCache();
            expect(engine.ElectionTypes).toHaveLength(0);
            expect(engine.TallyMethods).toHaveLength(0);
            expect(engine.EligibilitySourceTypes).toHaveLength(0);
            expect(engine.VoterCredentialMethods).toHaveLength(0);
            expect(engine.GetElectionTypesByIdMapForTest()).toBeNull();
            expect(ElectionSubtypeDirectory.Instance.Get('type-1')).toBeUndefined();
            expect(engine.IsConfiguredForUser('user-a')).toBe(false);

            await engine.Config(false, undefined, provider);
            expect(engine.LoadCalls[1].ForceRefresh).toBe(true);
        });

        it('skips entities where CanRead is false and clears stale slices across user switches', async () => {
            engine.NextLoadData = {
                electionTypes: [createMockElectionType({ ID: 'et-1', Code: 'motion' })],
                tallyMethods: [createMockTallyMethod({ ID: 'tm-1', Code: 'plurality' })],
                eligibilitySourceTypes: [createMockEligibilitySourceType({ ID: 'es-1', Code: 'csv' })],
                voterCredentialMethods: [createMockVoterCredentialMethod({ ID: 'vc-1', Code: 'emailed-link' })],
            };

            const adminProvider = createMockProvider('admin-user');
            await engine.Config(false, undefined, adminProvider);
            expect(engine.VoterCredentialMethods).toHaveLength(1);
            expect(engine.GetVoterCredentialMethodByCode('emailed-link')).toBeDefined();

            // Switch to restricted user who cannot read Voter Credential Methods or Eligibility Source Types
            const restrictedProvider = createMockProvider('restricted-user', {
                'MJ_BizApps_Voting: Voter Credential Methods': false,
                'MJ_BizApps_Voting: Eligibility Source Types': false,
            });
            await engine.Config(false, undefined, restrictedProvider);

            expect(engine.LoadCalls[1].ForceRefresh).toBe(true);
            expect(engine.LoadCalls[1].Configs.map((c) => c.EntityName)).toEqual([
                'MJ_BizApps_Voting: Election Types',
                'MJ_BizApps_Voting: Tally Methods',
            ]);
            // Stale restricted slices from admin user were cleared
            expect(engine.VoterCredentialMethods).toHaveLength(0);
            expect(engine.EligibilitySourceTypes).toHaveLength(0);
            expect(engine.GetVoterCredentialMethodByCode('emailed-link')).toBeUndefined();
            // Readable slices still populated
            expect(engine.ElectionTypes).toHaveLength(1);
            expect(engine.TallyMethods).toHaveLength(1);
        });

        it('handles a fully restricted user with CanRead=false on all taxonomy entities without calling Load()', async () => {
            const fullyRestricted = createMockProvider('guest-user', {
                'MJ_BizApps_Voting: Election Types': false,
                'MJ_BizApps_Voting: Tally Methods': false,
                'MJ_BizApps_Voting: Eligibility Source Types': false,
                'MJ_BizApps_Voting: Voter Credential Methods': false,
            });

            await engine.Config(false, undefined, fullyRestricted);
            expect(engine.LoadCalls).toHaveLength(0);
            expect(engine.ElectionTypes).toHaveLength(0);
            expect(engine.TallyMethods).toHaveLength(0);
            expect(engine.EligibilitySourceTypes).toHaveLength(0);
            expect(engine.VoterCredentialMethods).toHaveLength(0);
        });
    });
});
