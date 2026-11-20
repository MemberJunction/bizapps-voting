/**
 * Raw GraphQL and raw HTTP helpers for the adversarial tier.
 *
 * The typed wire client (`WireClient`) goes through GraphQLDataProvider, which pre-checks permissions and validates
 * client-side. An attack does not. These helpers speak the protocol directly with any credential (system key, user API
 * key, bearer JWT, or none at all), so the SERVER's refusal is what a check observes. Nothing here prints a credential.
 */
import { ResolveWireConfig } from './wire-config.js';

export type RawCredential =
    | { Kind: 'system' }
    | { Kind: 'user-key'; Key: string }
    | { Kind: 'bearer'; Token: string }
    | { Kind: 'none' };

export interface RawGraphQLResult<T> {
    /** HTTP status of the response. */
    Status: number;
    Data: T | null;
    /** `errors[].message` of the GraphQL response, empty when none. */
    Errors: string[];
    /** Raw response text (only for diagnosing; never contains a request credential). */
    Text: string;
}

export function CredentialHeaders(cred: RawCredential): Record<string, string> {
    const cfg = ResolveWireConfig();
    switch (cred.Kind) {
        case 'system':
            return { 'x-mj-api-key': cfg.SystemKey };
        case 'user-key':
            return { 'x-api-key': cred.Key };
        case 'bearer':
            return { Authorization: `Bearer ${cred.Token}` };
        case 'none':
            return {};
    }
}

export async function RawGraphQL<T>(cred: RawCredential, query: string, variables?: Record<string, unknown>, extraHeaders: Record<string, string> = {}): Promise<RawGraphQLResult<T>> {
    const cfg = ResolveWireConfig();
    const res = await fetch(cfg.GraphQLUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...CredentialHeaders(cred), ...extraHeaders },
        body: JSON.stringify({ query, variables }),
    });
    const text = await res.text();
    let parsed: { data?: T | null; errors?: Array<{ message?: string }> } = {};
    try {
        parsed = JSON.parse(text) as typeof parsed;
    } catch {
        // non-JSON body (an HTML error page, an empty 401): reported through Status/Text
    }
    return { Status: res.status, Data: parsed.data ?? null, Errors: (parsed.errors ?? []).map((e) => e.message ?? ''), Text: text };
}

/** Whether a failure reads as a permission/authentication refusal (as opposed to a validation or SQL error). */
export function IsRefusal(result: { Status: number; Errors: string[]; Text?: string }): boolean {
    if (result.Status === 401 || result.Status === 403) return true;
    const blob = result.Errors.join(' | ').toLowerCase();
    return /permission|not authorized|unauthori[sz]ed|forbidden|access denied|not allowed|cannot query field|unknown (type|field)|does not have/.test(blob);
}

export interface RawViewResult {
    /** True when the server ran the view (whatever it returned). */
    Ran: boolean;
    Refused: boolean;
    Rows: Array<Record<string, unknown>>;
    Total: number | null;
    Message: string;
}

/** `Run<ClassName>DynamicView` with an explicit field selection. */
export async function RawRunView(cred: RawCredential, className: string, entityName: string, fields: string[], options: { ExtraFilter?: string; MaxRows?: number; OrderBy?: string } = {}): Promise<RawViewResult> {
    const query = `query($input: RunDynamicViewInput!) { Run${className}DynamicView(input: $input) { Success ErrorMessage TotalRowCount Results { ${fields.map(GqlField).join(' ')} } } }`;
    const res = await RawGraphQL<Record<string, { Success: boolean; ErrorMessage?: string | null; TotalRowCount?: number | null; Results: Array<Record<string, unknown>> }>>(cred, query, {
        input: { EntityName: entityName, ExtraFilter: options.ExtraFilter ?? '', OrderBy: options.OrderBy ?? '', MaxRows: options.MaxRows ?? 50, IgnoreMaxRows: false },
    });
    const view = res.Data?.[`Run${className}DynamicView`];
    if (view?.Success) return { Ran: true, Refused: false, Rows: view.Results ?? [], Total: view.TotalRowCount ?? null, Message: '' };
    const message = view?.ErrorMessage ?? res.Errors.join(' | ') ?? `HTTP ${res.Status}`;
    return { Ran: false, Refused: IsRefusal({ Status: res.Status, Errors: [message, ...res.Errors] }), Rows: [], Total: null, Message: message || `HTTP ${res.Status}` };
}

export interface RawMutationResult {
    /** True when the server accepted the mutation (it executed and returned data). */
    Executed: boolean;
    /** The refusal was a permission/authentication/unknown-mutation refusal. */
    Refused: boolean;
    Message: string;
}

async function mutate(cred: RawCredential, query: string, variables: Record<string, unknown>): Promise<RawMutationResult> {
    const res = await RawGraphQL<Record<string, unknown>>(cred, query, variables);
    if (res.Data && Object.values(res.Data).some((v) => v !== null) && res.Errors.length === 0) return { Executed: true, Refused: false, Message: '' };
    const message = res.Errors.join(' | ') || `HTTP ${res.Status}`;
    return { Executed: false, Refused: IsRefusal(res), Message: message };
}

/** Create with an empty input: the server checks permission before it looks at the (missing) required columns. */
export async function RawCreateEmpty(cred: RawCredential, className: string): Promise<RawMutationResult> {
    return mutate(cred, `mutation($input: Create${className}Input!) { Create${className}(input: $input) { ID } }`, { input: {} });
}

/** Update that carries only the key: a no-op if it ever executes. */
export async function RawUpdateKeyOnly(cred: RawCredential, className: string, id: string): Promise<RawMutationResult> {
    return mutate(cred, `mutation($input: Update${className}Input!) { Update${className}(input: $input) { ID } }`, { input: { ID: id } });
}

/** Update that sets the given columns. Returns whether the server accepted it; the caller re-reads to learn whether it took effect. */
export async function RawUpdate(cred: RawCredential, className: string, id: string, fields: Record<string, unknown>): Promise<RawMutationResult> {
    return mutate(cred, `mutation($input: Update${className}Input!) { Update${className}(input: $input) { ID } }`, { input: { ID: id, ...fields } });
}

/** Delete one row. The mutation does not exist for entities whose delete API is off: that is a refusal too. */
export async function RawDelete(cred: RawCredential, className: string, id: string): Promise<RawMutationResult> {
    return mutate(
        cred,
        `mutation($id: String!, $options: DeleteOptionsInput!) { Delete${className}(ID: $id, options___: $options) { ID } }`,
        { id, options: { IsParentEntityDelete: false, ReplayOnly: false, SkipEntityAIActions: false, SkipEntityActions: false, SkipRecordChanges: false } }
    );
}


/** The GraphQL spelling of an entity field (MJ writes `__mj_CreatedAt` as `_mj__CreatedAt`). */
export function GqlField(name: string): string {
    return name.startsWith('__mj_') ? `_mj__${name.slice(5)}` : name;
}

export interface RawReadOutcome {
    /** The server returned data. */
    Ran: boolean;
    Rows: Array<Record<string, unknown>>;
    Message: string;
}

/** The generic `RunDynamicView` query (not the per-entity one): a second door to the same rows. */
export async function RawGenericRunView(cred: RawCredential, entityName: string, options: { ExtraFilter?: string; MaxRows?: number } = {}): Promise<RawReadOutcome> {
    const res = await RawGraphQL<{ RunDynamicView: { Success: boolean; ErrorMessage?: string | null; Results: Array<{ Data: string }> } }>(
        cred,
        'query($input: RunDynamicViewInput!) { RunDynamicView(input: $input) { Success ErrorMessage Results { Data } } }',
        { input: { EntityName: entityName, ExtraFilter: options.ExtraFilter ?? '', MaxRows: options.MaxRows ?? 20, IgnoreMaxRows: false } }
    );
    const view = res.Data?.RunDynamicView;
    if (view?.Success) return { Ran: true, Rows: view.Results.map((r) => JSON.parse(r.Data) as Record<string, unknown>), Message: '' };
    return { Ran: false, Rows: [], Message: view?.ErrorMessage ?? (res.Errors.join(' | ') || `HTTP ${res.Status}`) };
}

/** The single-record query `<className>(ID:)`: a third door. */
export async function RawGetRecord(cred: RawCredential, className: string, id: string, fields: string[]): Promise<RawReadOutcome> {
    const res = await RawGraphQL<Record<string, Record<string, unknown> | null>>(cred, `query($id: String!) { ${className}(ID: $id) { ${fields.map(GqlField).join(' ')} } }`, { id });
    const row = res.Data?.[className];
    if (row) return { Ran: true, Rows: [row], Message: '' };
    return { Ran: false, Rows: [], Message: res.Errors.join(' | ') || `HTTP ${res.Status} (null record)` };
}

/** `ExecuteAdhocQuery`: arbitrary SELECT text. A fourth door, and the widest if a persona may open it. */
export async function RawAdhocSql(cred: RawCredential, sql: string): Promise<RawReadOutcome> {
    const res = await RawGraphQL<{ ExecuteAdhocQuery: { Success: boolean; ErrorMessage?: string; Results: string } }>(
        cred,
        'query($input: AdhocQueryInput!) { ExecuteAdhocQuery(input: $input) { Success ErrorMessage Results } }',
        { input: { SQL: sql, MaxRows: 20 } }
    );
    const q = res.Data?.ExecuteAdhocQuery;
    if (q?.Success) {
        let rows: Array<Record<string, unknown>> = [];
        try {
            rows = JSON.parse(q.Results) as Array<Record<string, unknown>>;
        } catch {
            // leave empty
        }
        return { Ran: true, Rows: rows, Message: '' };
    }
    return { Ran: false, Rows: [], Message: q?.ErrorMessage || res.Errors.join(' | ') || `HTTP ${res.Status}` };
}


export interface RawRemoteOpResult<TOutput> {
    Success: boolean;
    ResultCode: string;
    ErrorMessage: string | null;
    Output: TOutput | null;
    /** HTTP status of the GraphQL call. */
    Status: number;
}

/** `ExecuteRemoteOperation` without the typed provider: cheap enough to run hundreds of sessions side by side. */
export async function RawRemoteOp<TOutput>(cred: RawCredential, operationKey: string, input: unknown): Promise<RawRemoteOpResult<TOutput>> {
    const res = await RawGraphQL<{ ExecuteRemoteOperation: { success: boolean; resultCode: string; outputJSON: string | null; errorMessage: string | null } }>(
        cred,
        'mutation($k: String!, $i: String!, $m: String!) { ExecuteRemoteOperation(input: { operationKey: $k, inputJSON: $i, invokeMode: $m }) { success resultCode outputJSON errorMessage } }',
        { k: operationKey, i: JSON.stringify(input), m: 'attached' }
    );
    const r = res.Data?.ExecuteRemoteOperation;
    if (!r) return { Success: false, ResultCode: `HTTP_${res.Status}`, ErrorMessage: res.Errors.join(' | ') || res.Text.slice(0, 120), Output: null, Status: res.Status };
    let output: TOutput | null = null;
    try {
        output = r.outputJSON ? (JSON.parse(r.outputJSON) as TOutput) : null;
    } catch {
        // leave null
    }
    return { Success: r.success, ResultCode: r.resultCode, ErrorMessage: r.errorMessage, Output: output, Status: res.Status };
}

// ─── The public /vote edge ───────────────────────────────────────────────────

export interface RawHttpResult {
    Status: number;
    Headers: Headers;
    Text: string;
    Json: Record<string, unknown> | null;
}

export async function RawHttp(path: string, init: { Method?: string; Headers?: Record<string, string>; Body?: string | Uint8Array } = {}): Promise<RawHttpResult> {
    const { BaseUrl } = ResolveWireConfig();
    const res = await fetch(`${BaseUrl}${path}`, { method: init.Method ?? 'GET', headers: init.Headers, body: init.Body as BodyInit | undefined, redirect: 'manual' });
    const text = await res.text();
    let json: Record<string, unknown> | null = null;
    try {
        const parsed: unknown = JSON.parse(text);
        json = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
        // not JSON
    }
    return { Status: res.status, Headers: res.headers, Text: text, Json: json };
}

/** POST /vote/session with a verbatim body string and chosen headers. */
export async function PostSessionRaw(body: string, headers: Record<string, string> = {}): Promise<RawHttpResult> {
    return RawHttp('/vote/session', { Method: 'POST', Headers: { 'content-type': 'application/json', ...headers }, Body: body });
}
