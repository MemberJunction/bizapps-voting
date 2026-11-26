/**
 * VotingEngineBase — browser-safe metadata engine for BizApps Voting (modeled on
 * CollaborationEngineBase).
 *
 * Caches the Voting lookup tables with CacheLocal: true so the admin UI, the
 * widgets and the server share one copy: Election Types, Tally Methods,
 * Eligibility Source Types and Voter Credential Methods
 * (plans/bizapps-voting-design.md §5–§6).
 *
 * Provides typed getters, O(1) lookups by ID and Code (case-insensitive),
 * active-only variants, and configuration parsing.
 */

import {
    BaseEngine,
    type BaseEnginePropertyConfig,
    type IMetadataProvider,
    LogError,
    Metadata,
    RegisterForStartup,
    type UserInfo,
} from '@memberjunction/core';
import { SafeJSONParse } from '@memberjunction/global';
import { ElectionSubtypeDirectory } from '@mj-biz-apps/voting-entities';
import type {
    mjBizAppsVotingElectionTypeEntity,
    mjBizAppsVotingTallyMethodEntity,
    mjBizAppsVotingEligibilitySourceTypeEntity,
    mjBizAppsVotingVoterCredentialMethodEntity,
} from '@mj-biz-apps/voting-entities';
import type { IElectionTypeConfiguration } from '@mj-biz-apps/voting-entities/contracts';

const normalizeKey = (key: string | null | undefined): string => (key ?? '').trim().toLowerCase();

const ENGINE_ENTITY_NAMES = {
    ElectionTypes: 'MJ_BizApps_Voting: Election Types',
    TallyMethods: 'MJ_BizApps_Voting: Tally Methods',
    EligibilitySourceTypes: 'MJ_BizApps_Voting: Eligibility Source Types',
    VoterCredentialMethods: 'MJ_BizApps_Voting: Voter Credential Methods',
} as const;

@RegisterForStartup()
export class VotingEngineBase extends BaseEngine<VotingEngineBase> {
    private _electionTypes: mjBizAppsVotingElectionTypeEntity[] = [];
    private _tallyMethods: mjBizAppsVotingTallyMethodEntity[] = [];
    private _eligibilitySourceTypes: mjBizAppsVotingEligibilitySourceTypeEntity[] = [];
    private _voterCredentialMethods: mjBizAppsVotingVoterCredentialMethodEntity[] = [];

    // O(1) memoized lookup indexes, reset on reload in AdditionalLoading() and InvalidateCache()
    private _electionTypesById: Map<string, mjBizAppsVotingElectionTypeEntity> | null = null;
    private _electionTypesByCode: Map<string, mjBizAppsVotingElectionTypeEntity> | null = null;
    private _tallyMethodsById: Map<string, mjBizAppsVotingTallyMethodEntity> | null = null;
    private _tallyMethodsByCode: Map<string, mjBizAppsVotingTallyMethodEntity> | null = null;
    private _eligibilitySourceTypesById: Map<string, mjBizAppsVotingEligibilitySourceTypeEntity> | null = null;
    private _eligibilitySourceTypesByCode: Map<string, mjBizAppsVotingEligibilitySourceTypeEntity> | null = null;
    private _voterCredentialMethodsById: Map<string, mjBizAppsVotingVoterCredentialMethodEntity> | null = null;
    private _voterCredentialMethodsByCode: Map<string, mjBizAppsVotingVoterCredentialMethodEntity> | null = null;

    private _loadedForUserId: string | null = null;
    private _cacheInvalidated: boolean = false;
    private _activeProvider: IMetadataProvider | null = null;

    protected constructor() {
        super();
    }

    public static get Instance(): VotingEngineBase {
        return super.getInstance<VotingEngineBase>();
    }

    /**
     * Always routes RunViews through the active provider passed to `Config()` (or live
     * `Metadata.Provider` in browser sessions) instead of BaseEngine's first-wins `_provider`
     * latch — essential for multi-provider environments and persona impersonation.
     */
    public override get ProviderToUse(): IMetadataProvider {
        return this._activeProvider ?? Metadata.Provider;
    }

    public async Config(
        forceRefresh?: boolean,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<void> {
        this._activeProvider = provider ?? null;
        const md = this.ProviderToUse;
        const effectiveUser = contextUser ?? md?.CurrentUser;
        const nextUserId = normalizeKey(effectiveUser?.ID);
        const userChanged =
            this._loadedForUserId !== null &&
            nextUserId.length > 0 &&
            this._loadedForUserId !== nextUserId;
        const shouldForceRefresh = Boolean(forceRefresh || this._cacheInvalidated || userChanged);

        const canReadEntity = (entityName: string): boolean => {
            if (!effectiveUser || !md || typeof md.EntityByName !== 'function') {
                return true;
            }
            const entity = md.EntityByName(entityName);
            if (!entity || typeof entity.GetUserPermisions !== 'function') {
                return true;
            }
            return entity.GetUserPermisions(effectiveUser)?.CanRead !== false;
        };

        // All four entities below are bounded, shared, non-RLS taxonomy/lookup tables, so
        // CacheLocal: true is safe. Any RLS-scoped entity added in the future MUST use
        // CacheLocal: false to prevent cross-user/impersonation IndexedDB bleed.
        const allConfigs: ReadonlyArray<{
            config: Partial<BaseEnginePropertyConfig>;
            clear: () => void;
        }> = [
            {
                config: {
                    PropertyName: '_electionTypes',
                    EntityName: ENGINE_ENTITY_NAMES.ElectionTypes,
                    CacheLocal: true,
                    OrderBy: 'Name',
                },
                clear: () => {
                    this._electionTypes = [];
                },
            },
            {
                config: {
                    PropertyName: '_tallyMethods',
                    EntityName: ENGINE_ENTITY_NAMES.TallyMethods,
                    CacheLocal: true,
                    OrderBy: 'Name',
                },
                clear: () => {
                    this._tallyMethods = [];
                },
            },
            {
                config: {
                    PropertyName: '_eligibilitySourceTypes',
                    EntityName: ENGINE_ENTITY_NAMES.EligibilitySourceTypes,
                    CacheLocal: true,
                    OrderBy: 'Name',
                },
                clear: () => {
                    this._eligibilitySourceTypes = [];
                },
            },
            {
                config: {
                    PropertyName: '_voterCredentialMethods',
                    EntityName: ENGINE_ENTITY_NAMES.VoterCredentialMethods,
                    CacheLocal: true,
                    OrderBy: 'Name',
                },
                clear: () => {
                    this._voterCredentialMethods = [];
                },
            },
        ];

        const params: Array<Partial<BaseEnginePropertyConfig>> = [];
        for (const entry of allConfigs) {
            const entityName = entry.config.EntityName ?? '';
            if (canReadEntity(entityName)) {
                params.push(entry.config);
            } else {
                entry.clear();
            }
        }

        if (params.length > 0) {
            await this.Load(params, md, shouldForceRefresh, effectiveUser);
        } else {
            await this.AdditionalLoading(effectiveUser);
        }

        this._loadedForUserId = nextUserId || null;
        this._cacheInvalidated = false;
    }

    /**
     * Clears O(1) lookup maps, cached slices, subtype directory, and provider binding so the
     * next `Config()` performs a fresh load under the active user and provider.
     */
    public InvalidateCache(): void {
        this._cacheInvalidated = true;
        this._loadedForUserId = null;
        this._activeProvider = null;
        this._electionTypes = [];
        this._tallyMethods = [];
        this._eligibilitySourceTypes = [];
        this._voterCredentialMethods = [];
        this.resetLookupIndexes();
        ElectionSubtypeDirectory.Instance.Replace([]);
    }

    public IsConfiguredForUser(userId: string | null | undefined): boolean {
        if (!this.Loaded || this._cacheInvalidated) {
            return false;
        }
        const norm = normalizeKey(userId);
        if (!norm) {
            return this._loadedForUserId !== null;
        }
        return this._loadedForUserId === norm;
    }

    private resetLookupIndexes(): void {
        this._electionTypesById = null;
        this._electionTypesByCode = null;
        this._tallyMethodsById = null;
        this._tallyMethodsByCode = null;
        this._eligibilitySourceTypesById = null;
        this._eligibilitySourceTypesByCode = null;
        this._voterCredentialMethodsById = null;
        this._voterCredentialMethodsByCode = null;
    }

    protected override async AdditionalLoading(_contextUser?: UserInfo): Promise<void> {
        // Invalidate memoized lookup indexes on initial load and any reload
        this.resetLookupIndexes();
        // The extension entity each election type names, for the Elections subtype resolver: it answers
        // a load's hint from memory, never by a read.
        ElectionSubtypeDirectory.Instance.Replace(
            this.ElectionTypes.map((type) => ({ ID: type.ID, ElectionExtensionEntity: type.ElectionExtensionEntity }))
        );
    }

    // ─── Collections ───────────────────────────────────────────────────────────

    public get ElectionTypes(): mjBizAppsVotingElectionTypeEntity[] {
        return this.GetConfigData<mjBizAppsVotingElectionTypeEntity>('_electionTypes');
    }

    public get TallyMethods(): mjBizAppsVotingTallyMethodEntity[] {
        return this.GetConfigData<mjBizAppsVotingTallyMethodEntity>('_tallyMethods');
    }

    public get EligibilitySourceTypes(): mjBizAppsVotingEligibilitySourceTypeEntity[] {
        return this.GetConfigData<mjBizAppsVotingEligibilitySourceTypeEntity>('_eligibilitySourceTypes');
    }

    public get VoterCredentialMethods(): mjBizAppsVotingVoterCredentialMethodEntity[] {
        return this.GetConfigData<mjBizAppsVotingVoterCredentialMethodEntity>('_voterCredentialMethods');
    }

    // ─── Active-Only Variants ──────────────────────────────────────────────────

    public get ActiveElectionTypes(): mjBizAppsVotingElectionTypeEntity[] {
        return this.ElectionTypes.filter(t => t.Status === 'Active');
    }

    public get ActiveTallyMethods(): mjBizAppsVotingTallyMethodEntity[] {
        return this.TallyMethods.filter(m => m.Status === 'Active');
    }

    public get ActiveEligibilitySourceTypes(): mjBizAppsVotingEligibilitySourceTypeEntity[] {
        return this.EligibilitySourceTypes.filter(t => t.Status === 'Active');
    }

    public get ActiveVoterCredentialMethods(): mjBizAppsVotingVoterCredentialMethodEntity[] {
        return this.VoterCredentialMethods.filter(m => m.Status === 'Active');
    }

    // ─── Election Type Lookups ─────────────────────────────────────────────────

    private ensureElectionTypeMaps(): void {
        if (!this._electionTypesById || !this._electionTypesByCode) {
            const byId = new Map<string, mjBizAppsVotingElectionTypeEntity>();
            const byCode = new Map<string, mjBizAppsVotingElectionTypeEntity>();
            for (const t of this.ElectionTypes) {
                if (t.ID) byId.set(normalizeKey(t.ID), t);
                if (t.Code) byCode.set(normalizeKey(t.Code), t);
            }
            this._electionTypesById = byId;
            this._electionTypesByCode = byCode;
        }
    }

    public GetElectionTypeByID(id: string | null | undefined): mjBizAppsVotingElectionTypeEntity | undefined {
        if (!id) return undefined;
        this.ensureElectionTypeMaps();
        return this._electionTypesById?.get(normalizeKey(id));
    }

    public GetElectionTypeByCode(code: string | null | undefined): mjBizAppsVotingElectionTypeEntity | undefined {
        if (!code) return undefined;
        this.ensureElectionTypeMaps();
        return this._electionTypesByCode?.get(normalizeKey(code));
    }

    // ─── Tally Method Lookups ──────────────────────────────────────────────────

    private ensureTallyMethodMaps(): void {
        if (!this._tallyMethodsById || !this._tallyMethodsByCode) {
            const byId = new Map<string, mjBizAppsVotingTallyMethodEntity>();
            const byCode = new Map<string, mjBizAppsVotingTallyMethodEntity>();
            for (const m of this.TallyMethods) {
                if (m.ID) byId.set(normalizeKey(m.ID), m);
                if (m.Code) byCode.set(normalizeKey(m.Code), m);
            }
            this._tallyMethodsById = byId;
            this._tallyMethodsByCode = byCode;
        }
    }

    public GetTallyMethodByID(id: string | null | undefined): mjBizAppsVotingTallyMethodEntity | undefined {
        if (!id) return undefined;
        this.ensureTallyMethodMaps();
        return this._tallyMethodsById?.get(normalizeKey(id));
    }

    public GetTallyMethodByCode(code: string | null | undefined): mjBizAppsVotingTallyMethodEntity | undefined {
        if (!code) return undefined;
        this.ensureTallyMethodMaps();
        return this._tallyMethodsByCode?.get(normalizeKey(code));
    }

    // ─── Eligibility Source Type Lookups ───────────────────────────────────────

    private ensureEligibilitySourceTypeMaps(): void {
        if (!this._eligibilitySourceTypesById || !this._eligibilitySourceTypesByCode) {
            const byId = new Map<string, mjBizAppsVotingEligibilitySourceTypeEntity>();
            const byCode = new Map<string, mjBizAppsVotingEligibilitySourceTypeEntity>();
            for (const t of this.EligibilitySourceTypes) {
                if (t.ID) byId.set(normalizeKey(t.ID), t);
                if (t.Code) byCode.set(normalizeKey(t.Code), t);
            }
            this._eligibilitySourceTypesById = byId;
            this._eligibilitySourceTypesByCode = byCode;
        }
    }

    public GetEligibilitySourceTypeByID(
        id: string | null | undefined
    ): mjBizAppsVotingEligibilitySourceTypeEntity | undefined {
        if (!id) return undefined;
        this.ensureEligibilitySourceTypeMaps();
        return this._eligibilitySourceTypesById?.get(normalizeKey(id));
    }

    public GetEligibilitySourceTypeByCode(
        code: string | null | undefined
    ): mjBizAppsVotingEligibilitySourceTypeEntity | undefined {
        if (!code) return undefined;
        this.ensureEligibilitySourceTypeMaps();
        return this._eligibilitySourceTypesByCode?.get(normalizeKey(code));
    }

    // ─── Voter Credential Method Lookups ────────────────────────────────────────

    private ensureVoterCredentialMethodMaps(): void {
        if (!this._voterCredentialMethodsById || !this._voterCredentialMethodsByCode) {
            const byId = new Map<string, mjBizAppsVotingVoterCredentialMethodEntity>();
            const byCode = new Map<string, mjBizAppsVotingVoterCredentialMethodEntity>();
            for (const m of this.VoterCredentialMethods) {
                if (m.ID) byId.set(normalizeKey(m.ID), m);
                if (m.Code) byCode.set(normalizeKey(m.Code), m);
            }
            this._voterCredentialMethodsById = byId;
            this._voterCredentialMethodsByCode = byCode;
        }
    }

    public GetVoterCredentialMethodByID(
        id: string | null | undefined
    ): mjBizAppsVotingVoterCredentialMethodEntity | undefined {
        if (!id) return undefined;
        this.ensureVoterCredentialMethodMaps();
        return this._voterCredentialMethodsById?.get(normalizeKey(id));
    }

    public GetVoterCredentialMethodByCode(
        code: string | null | undefined
    ): mjBizAppsVotingVoterCredentialMethodEntity | undefined {
        if (!code) return undefined;
        this.ensureVoterCredentialMethodMaps();
        return this._voterCredentialMethodsByCode?.get(normalizeKey(code));
    }

    // ─── Configuration Parsing ─────────────────────────────────────────────────

    /**
     * Parses the Configuration JSON column of an election type into a typed object.
     * Returns null if the ID is not found, the configuration is missing/null, or the JSON is invalid.
     */
    public GetElectionTypeConfiguration(typeID: string | null | undefined): IElectionTypeConfiguration | null {
        if (!typeID) return null;

        const type = this.GetElectionTypeByID(typeID);
        if (!type || !type.Configuration) {
            return null;
        }

        try {
            const parsed = SafeJSONParse<IElectionTypeConfiguration>(type.Configuration);
            if (parsed === null) {
                LogError(`Failed to parse election type configuration for type ${typeID}: invalid JSON`);
                return null;
            }
            return parsed;
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            LogError(`Failed to parse election type configuration for type ${typeID}: ${message}`);
            return null;
        }
    }
}
