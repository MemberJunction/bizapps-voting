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
import { SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import { ElectionSubtypeDirectory } from '@mj-biz-apps/voting-entities';
import type {
    mjBizAppsVotingElectionTypeEntity,
    mjBizAppsVotingTallyMethodEntity,
    mjBizAppsVotingEligibilitySourceTypeEntity,
    mjBizAppsVotingVoterCredentialMethodEntity,
} from '@mj-biz-apps/voting-entities';
import type { IElectionTypeConfiguration } from '@mj-biz-apps/voting-entities/contracts';

const normalizeKey = (key: string | null | undefined): string => (key ?? '').trim().toLowerCase();

@RegisterForStartup()
export class VotingEngineBase extends BaseEngine<VotingEngineBase> {
    private _electionTypes: mjBizAppsVotingElectionTypeEntity[] = [];
    private _tallyMethods: mjBizAppsVotingTallyMethodEntity[] = [];
    private _eligibilitySourceTypes: mjBizAppsVotingEligibilitySourceTypeEntity[] = [];
    private _voterCredentialMethods: mjBizAppsVotingVoterCredentialMethodEntity[] = [];

    // O(1) memoized lookup indexes, reset on reload in AdditionalLoading()
    private _electionTypesById: Map<string, mjBizAppsVotingElectionTypeEntity> | null = null;
    private _electionTypesByCode: Map<string, mjBizAppsVotingElectionTypeEntity> | null = null;
    private _tallyMethodsById: Map<string, mjBizAppsVotingTallyMethodEntity> | null = null;
    private _tallyMethodsByCode: Map<string, mjBizAppsVotingTallyMethodEntity> | null = null;
    private _eligibilitySourceTypesById: Map<string, mjBizAppsVotingEligibilitySourceTypeEntity> | null = null;
    private _eligibilitySourceTypesByCode: Map<string, mjBizAppsVotingEligibilitySourceTypeEntity> | null = null;
    private _voterCredentialMethodsById: Map<string, mjBizAppsVotingVoterCredentialMethodEntity> | null = null;
    private _voterCredentialMethodsByCode: Map<string, mjBizAppsVotingVoterCredentialMethodEntity> | null = null;

    public static get Instance(): VotingEngineBase {
        return super.getInstance<VotingEngineBase>();
    }

    public async Config(
        forceRefresh?: boolean,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<void> {
        const md = provider ?? Metadata.Provider;
        const params: Array<Partial<BaseEnginePropertyConfig>> = [
            {
                PropertyName: '_electionTypes',
                EntityName: 'MJ_BizApps_Voting: Election Types',
                CacheLocal: true,
                OrderBy: 'Name',
            },
            {
                PropertyName: '_tallyMethods',
                EntityName: 'MJ_BizApps_Voting: Tally Methods',
                CacheLocal: true,
                OrderBy: 'Name',
            },
            {
                PropertyName: '_eligibilitySourceTypes',
                EntityName: 'MJ_BizApps_Voting: Eligibility Source Types',
                CacheLocal: true,
                OrderBy: 'Name',
            },
            {
                PropertyName: '_voterCredentialMethods',
                EntityName: 'MJ_BizApps_Voting: Voter Credential Methods',
                CacheLocal: true,
                OrderBy: 'Name',
            },
        ];
        return await this.Load(params, md, forceRefresh ?? false, contextUser);
    }

    protected override async AdditionalLoading(contextUser?: UserInfo): Promise<void> {
        // Invalidate memoized lookup indexes on initial load and any reload
        this._electionTypesById = null;
        this._electionTypesByCode = null;
        this._tallyMethodsById = null;
        this._tallyMethodsByCode = null;
        this._eligibilitySourceTypesById = null;
        this._eligibilitySourceTypesByCode = null;
        this._voterCredentialMethodsById = null;
        this._voterCredentialMethodsByCode = null;
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
