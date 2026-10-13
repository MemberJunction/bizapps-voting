/**
 * VotingEngineBase — browser-safe metadata engine for BizApps Voting (modeled on
 * CollaborationEngineBase).
 *
 * Caches the Voting lookup tables with CacheLocal: true so the admin UI, the
 * widgets and the server share one copy: Election Types, Tally Methods,
 * Eligibility Source Types and Voter Credential Methods
 * (plans/bizapps-voting-design.md §5–§6).
 *
 * Nothing is cached yet: the entries are added to Config() once the first
 * migration and CodeGen produce those entities in @mj-biz-apps/voting-entities.
 */

import {
    BaseEngine,
    type BaseEnginePropertyConfig,
    type IMetadataProvider,
    Metadata,
    type UserInfo,
} from '@memberjunction/core';

export class VotingEngineBase extends BaseEngine<VotingEngineBase> {
    public static get Instance(): VotingEngineBase {
        return super.getInstance<VotingEngineBase>();
    }

    public async Config(
        forceRefresh?: boolean,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<void> {
        const md = provider ?? Metadata.Provider;
        const params: Array<Partial<BaseEnginePropertyConfig>> = [];
        return await this.Load(params, md, forceRefresh ?? false, contextUser);
    }
}
