/**
 * One authenticated identity over the wire: its own GraphQLDataProvider, its own credentials, its own metadata.
 *
 * CLIENT-SAFE BY CONSTRUCTION. This module and everything it imports must never reach @mj-biz-apps/voting-server,
 * voting-core-entities-server or sqlserver-dataprovider: those register server-only entity subclasses whose constructors
 * throw on a GraphQL provider, and a real browser has none of them. Only the browser-safe packages are imported.
 *
 * Why several providers can coexist: GraphQLDataProvider's constructor returns the process singleton whenever one exists,
 * so `new GraphQLDataProvider()` would hand back (and then RECONFIGURE) the first provider. The singleton slot in the
 * global object store is parked around construction, then restored, which yields a genuinely separate instance;
 * `Config(..., separateConnection = true)` keeps its session and HTTP client apart. Entities and views are always reached
 * through `client.Provider` (never the global `Metadata`), so each persona's calls carry only that persona's credentials.
 */
import {
    BaseEntity,
    RunView,
    type BaseRemotableOperation,
    type RemoteOpResult,
    type RunViewParams,
    type RunViewResult,
    type UserInfo,
} from '@memberjunction/core';
import { GetGlobalObjectStore } from '@memberjunction/global';
import { GraphQLDataProvider, GraphQLProviderConfigData } from '@memberjunction/graphql-dataprovider';
import { ResolveWireConfig } from './wire-config.js';

/** GraphQLDataProvider's Global-Object-Store key (see the file comment). */
const GRAPHQL_PROVIDER_SINGLETON_KEY = '___SINGLETON__GraphQLDataProvider';

function newSeparateProvider(): GraphQLDataProvider {
    const store = GetGlobalObjectStore();
    const singleton = store?.[GRAPHQL_PROVIDER_SINGLETON_KEY];
    if (store) delete store[GRAPHQL_PROVIDER_SINGLETON_KEY];
    try {
        return new GraphQLDataProvider();
    } finally {
        if (store && singleton) store[GRAPHQL_PROVIDER_SINGLETON_KEY] = singleton;
    }
}

export type WireCredential =
    | { Kind: 'system'; Key: string }
    | { Kind: 'user-key'; Key: string }
    | { Kind: 'bearer'; Token: string };

export class WireClient {
    private constructor(
        public readonly Label: string,
        public readonly Provider: GraphQLDataProvider,
        /** The signed-in user as the server reports it; undefined for a guest (metadata-less) client. */
        public readonly User: UserInfo | undefined
    ) {}

    /**
     * A full client: authenticates, downloads metadata, knows its user. Use for the system key, for user API keys, and for a
     * magic-link session JWT that should behave like a signed-in (Explorer) session.
     */
    public static async Connect(label: string, credential: WireCredential): Promise<WireClient> {
        const cfg = ResolveWireConfig();
        const provider = newSeparateProvider();
        const config = new GraphQLProviderConfigData(
            credential.Kind === 'bearer' ? credential.Token : '',
            cfg.GraphQLUrl,
            '', // no subscriptions on this tier
            async () => (credential.Kind === 'bearer' ? credential.Token : ''),
            undefined,
            undefined,
            undefined,
            credential.Kind === 'system' ? credential.Key : undefined,
            credential.Kind === 'user-key' ? credential.Key : undefined
        );
        if (!(await provider.Config(config, undefined, true))) throw new Error(`${label}: GraphQLDataProvider.Config returned false`);
        const user = provider.CurrentUser ?? undefined;
        if (!user) throw new Error(`${label}: the server did not report a current user for this credential`);
        return new WireClient(label, provider, user);
    }

    /**
     * An authenticate-only client for a guest ballot session (a magic-link JWT). It never downloads metadata: a guest
     * reaches the server only through Remote Operations, exactly as the `<mj-ballot>` embed does.
     */
    public static async ConnectGuest(label: string, bearerToken: string): Promise<WireClient> {
        const cfg = ResolveWireConfig();
        const provider = newSeparateProvider();
        const config = new GraphQLProviderConfigData(bearerToken, cfg.GraphQLUrl, '', async () => bearerToken);
        await provider.Connect(config);
        return new WireClient(label, provider, undefined);
    }

    /** Runs a view as this identity. */
    public async RunView<T>(params: RunViewParams): Promise<RunViewResult<T>> {
        return RunView.FromMetadataProvider(this.Provider).RunView<T>(params, this.User);
    }

    /** A new entity object bound to THIS identity's provider (never the global one). */
    public async NewEntity<T extends BaseEntity>(entityName: string): Promise<T> {
        return this.Provider.GetEntityObject<T>(entityName, this.User);
    }

    /**
     * Calls a Remote Operation over GraphQL (`ExecuteRemoteOperation`) as this identity. Never throws for a logical refusal:
     * inspect `Success`, `ResultCode` (for example `FORBIDDEN`) and `ErrorMessage`.
     */
    public async Call<TInput, TOutput>(operation: BaseRemotableOperation<TInput, TOutput>, input: TInput): Promise<RemoteOpResult<TOutput>> {
        return operation.Execute(input, { provider: this.Provider });
    }
}
