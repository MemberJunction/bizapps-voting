/**
 * The public, pre-auth ballot edge: `GET /vote/:slug` (first-party page), `GET /vote/:slug/info`, `POST /vote/session`
 * and `GET /vote/element/main.js`. It mounts as a standard pre-auth MJ server extension:
 * a `BaseServerExtension` registered under the key 'VotingBallotEdge' and declared in `MJ_SERVER_EXTENSIONS`
 * (see `server-extensions-manifest.ts`), so MJAPI loads it from `dynamicPackages.server[]` with no host config to copy.
 * It runs before MJServer's auth middleware: a voter has no bearer token yet, and the distribution slug plus a credential
 * are what gate access.
 *
 * The decisions live in `edge-core.ts` (gate order, error contract); this file is Express wiring and the data loaders.
 */
import BodyParser from 'body-parser';
import type { Application, Request, Response } from 'express';
import { LogError, LogStatus, Metadata } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    BaseServerExtension,
    type ExtensionHealthResult,
    type ExtensionInitResult,
    type ServerExtensionConfig,
} from '@memberjunction/server-extensions-core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { configInfo } from '@memberjunction/server';
import type { mjBizAppsVotingBallotDistributionEntity } from '@mj-biz-apps/voting-entities';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ParseAllowedMethods } from '../credentials/credential-crypto.js';
import { CredentialEngine } from '../engines/credential-engine.js';
import { LoadElectionGraph } from '../shared/election-graph.js';
import { GetSystemUser } from '../shared/system-user.js';
import { IsFailure, RunViewOf, type VotingContext } from '../shared/types.js';
import { SqlLiteral } from '../shared/voter-identity.js';
import {
    EDGE_ERRORS,
    ErrorResponse,
    HandleInfo,
    HandlePreflight,
    HandleSession,
    RateGate,
    type DistributionRecord,
    type EdgeDeps,
    type EdgeRequest,
    type EdgeResponse,
} from './edge-core.js';
import { ElementAssetHeaders, IsValidSlug, NormalizeGraphQLPath, ParseAllowedOrigins, ResolveClientIp, ResolveGraphQLUrl } from './edge-policy.js';
import { BuildHostErrorResponse, BuildHostPageResponse, type HostPageResponse } from './host-page.js';
import { FixedWindowRateLimiter } from './rate-limiter.js';
import { MAX_BODY_LIMIT } from './request-validation.js';
import { MintBallotSession, type MintSettings } from './session-mint.js';

const DISTRIBUTIONS = 'MJ_BizApps_Voting: Ballot Distributions';
const ELECTIONS = 'MJ_BizApps_Voting: Elections';

const DEFAULT_RATE_WINDOW_MS = 60_000;
/** POST /session and GET per (IP, slug) per window. Voters sign in a handful of times; this is generous for a household behind one NAT. */
const DEFAULT_RATE_MAX = 20;
const DEFAULT_RATE_MAX_GLOBAL = 90;

interface BallotEdgeSettings extends MintSettings {
    RateLimitWindowMs?: number;
    RateLimitMax?: number;
    RateLimitMaxGlobal?: number;
    /** Reverse proxies that append to X-Forwarded-For. 0 (default) uses the socket address. */
    TrustedProxyHops?: number;
    /** Absolute GraphQL URL to advertise in /info when the public address differs from what the request shows (gateways). */
    GraphQLUrl?: string;
}

const requireFromHere = createRequire(import.meta.url);

/** Directory of the built `<mj-ballot>` bundle (AngularWidgets/dist-element), if present. */
function resolveElementDir(): string | null {
    const candidates: string[] = [];
    try {
        const entry = requireFromHere.resolve('@mj-biz-apps/voting-ng-widgets');
        candidates.push(path.join(path.dirname(entry), '..', 'dist-element'));
    } catch {
        /* the package is not a declared dependency of this one; fall through to the sibling-folder lookup */
    }
    try {
        const here = path.dirname(fileURLToPath(import.meta.url));
        candidates.push(path.resolve(here, '../../../AngularWidgets/dist-element')); // works from both src/edge and dist/edge
    } catch {
        /* non-file URL */
    }
    return candidates.find((dir) => existsSync(path.join(dir, 'main.js'))) ?? null;
}

function parseTheme(text: string | null): Record<string, unknown> | null {
    if (!text || !text.trim()) return null;
    try {
        const parsed: unknown = JSON.parse(text);
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}

@RegisterClass(BaseServerExtension, 'VotingBallotEdge')
export class BallotEdgeExtension extends BaseServerExtension {
    private settings: BallotEdgeSettings = {};
    private limiter = new FixedWindowRateLimiter(DEFAULT_RATE_WINDOW_MS);
    private rootPath = '/vote';
    private deps!: EdgeDeps;

    public async Initialize(app: Application, config: ServerExtensionConfig): Promise<ExtensionInitResult> {
        this.settings = (config.Settings ?? {}) as BallotEdgeSettings;
        const root = config.RootPath.replace(/\/+$/, '') || '/vote';
        this.rootPath = root;
        this.limiter = new FixedWindowRateLimiter(this.settings.RateLimitWindowMs ?? DEFAULT_RATE_WINDOW_MS);
        this.deps = this.buildDeps();

        const elementDir = resolveElementDir();
        if (elementDir) {
            app.get(`${root}/element/main.js`, (_req: Request, res: Response) => {
                for (const [k, v] of Object.entries(ElementAssetHeaders())) res.setHeader(k, v);
                res.type('application/javascript').sendFile(path.join(elementDir, 'main.js'));
            });
            LogStatus(`[Voting] Ballot element served from ${elementDir} at GET ${root}/element/main.js`);
        }

        const json = BodyParser.json({ limit: MAX_BODY_LIMIT });
        app.options(`${root}/session`, (req: Request, res: Response) => void this.run(res, () => HandlePreflight(this.deps, this.edgeRequest(req))));
        app.post(`${root}/session`, (req: Request, res: Response) => this.parseBodyThen(json, req, res));
        app.get(`${root}/:slug/info`, (req: Request, res: Response) => void this.run(res, () => HandleInfo(this.deps, this.edgeRequest(req), String(req.params.slug ?? ''))));
        app.get(`${root}/:slug`, (req: Request, res: Response) => void this.handleHost(req, res));

        LogStatus(`[Voting] Ballot edge registered at GET ${root}/:slug, GET ${root}/:slug/info, POST ${root}/session`);
        return {
            Success: true,
            Message: 'Voting ballot edge mounted (public host page, rate-limited session sign-in, origin-gated).',
            RegisteredRoutes: [`GET ${root}/:slug`, `GET ${root}/:slug/info`, `POST ${root}/session`, `GET ${root}/element/main.js`],
        };
    }

    public async Shutdown(): Promise<void> {
        this.limiter.Clear();
    }

    public async HealthCheck(): Promise<ExtensionHealthResult> {
        const ok = !!UserCache.Instance.GetSystemUser();
        return ok
            ? { Healthy: true, Name: 'VotingBallotEdge' }
            : { Healthy: false, Name: 'VotingBallotEdge', Details: { Reason: 'The MJ system user is unavailable; every sign-in will be refused.' } };
    }

    // ─── Express glue ─────────────────────────────────────────────────────────

    private edgeRequest(req: Request): EdgeRequest {
        const origin = req.headers.origin;
        const host = req.headers.host;
        return {
            Ip: ResolveClientIp(req, this.settings.TrustedProxyHops ?? 0),
            Origin: typeof origin === 'string' ? origin : undefined,
            Host: typeof host === 'string' ? host : undefined,
            Protocol: req.protocol,
        };
    }

    /** Gate 1: the 8 KB body cap. A body-parser failure (too large, malformed) ends the request here with a generic error. */
    private parseBodyThen(json: ReturnType<typeof BodyParser.json>, req: Request, res: Response): void {
        json(req, res, (err?: unknown) => {
            if (err) {
                const tooLarge = typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.too.large';
                this.send(res, ErrorResponse(tooLarge ? 'payload_too_large' : 'bad_request'));
                return;
            }
            void this.run(res, () => HandleSession(this.deps, this.edgeRequest(req), req.body as unknown));
        });
    }

    private async run(res: Response, handler: () => Promise<EdgeResponse>): Promise<void> {
        try {
            this.send(res, await handler());
        } catch (err) {
            LogError(`[VotingBallotEdge] Unhandled error: ${err instanceof Error ? err.name : 'error'}`);
            if (!res.headersSent) this.send(res, ErrorResponse('unavailable'));
        }
    }

    private send(res: Response, r: EdgeResponse): void {
        for (const [k, v] of Object.entries(r.Headers)) res.setHeader(k, v);
        if (r.Body === null) res.status(r.Status).end();
        else res.status(r.Status).json(r.Body);
    }

    private sendHtml(res: Response, r: HostPageResponse): void {
        for (const [k, v] of Object.entries(r.Headers)) res.setHeader(k, v);
        res.status(r.Status).send(r.Html);
    }

    private async handleHost(req: Request, res: Response): Promise<void> {
        try {
            const slug = String(req.params.slug ?? '').trim();
            const er = this.edgeRequest(req);
            const limited = RateGate(this.deps, er, 'host', slug.slice(0, 100).toLowerCase());
            if (limited) {
                res.setHeader('Retry-After', limited.Headers['Retry-After'] ?? '60');
                this.sendHtml(res, BuildHostErrorResponse(429, EDGE_ERRORS.rate_limited.Message));
                return;
            }
            const dist = IsValidSlug(slug) ? await this.deps.LoadDistribution(slug) : null;
            if (!dist || dist.Entity.Status !== 'Active' || dist.ElectionStatus !== 'Open') {
                this.sendHtml(res, BuildHostErrorResponse(404, EDGE_ERRORS.not_found.Message));
                return;
            }
            this.sendHtml(
                res,
                BuildHostPageResponse(
                    { Slug: slug, ApiRoot: this.rootPath, GraphQLUrl: this.graphQLPath(), ElementSrc: resolveElementDir() ? `${this.rootPath}/element/main.js` : undefined, Title: dist.ElectionName },
                    dist.AllowedOrigins
                )
            );
        } catch (err) {
            LogError(`[VotingBallotEdge] Unhandled error on host page: ${err instanceof Error ? err.name : 'error'}`);
            if (!res.headersSent) this.sendHtml(res, BuildHostErrorResponse(500, EDGE_ERRORS.unavailable.Message));
        }
    }

    // ─── Collaborators ────────────────────────────────────────────────────────

    private buildDeps(): EdgeDeps {
        return {
            LoadDistribution: (slug) => this.loadDistribution(slug),
            Verify: async (dist, methodCode, credential) => {
                const result = await CredentialEngine.Instance.VerifyCredential(dist.Entity, methodCode, credential, this.systemContext());
                return IsFailure(result)
                    ? { Ok: false, Code: result.Code }
                    : { Ok: true, ElectionID: result.Value.ElectionID, EligibleVoterID: result.Value.EligibleVoterID };
            },
            Mint: (electionID, voterID) => MintBallotSession(electionID, voterID, this.settings),
            GraphQLUrl: (req) => ResolveGraphQLUrl({ Configured: this.settings.GraphQLUrl, RootPath: configInfo.graphqlRootPath, Protocol: req.Protocol, Host: req.Host }),
            Limiter: this.limiter,
            RateMax: this.settings.RateLimitMax ?? DEFAULT_RATE_MAX,
            RateMaxGlobal: this.settings.RateLimitMaxGlobal ?? DEFAULT_RATE_MAX_GLOBAL,
            Log: (m) => LogStatus(m),
        };
    }

    /** MJ's GraphQL route as a path. The first-party page is served by the same server, so a path is exact and cannot be spoofed through the Host header. */
    private graphQLPath(): string {
        return NormalizeGraphQLPath(configInfo.graphqlRootPath);
    }

    private systemContext(): VotingContext {
        return { ContextUser: GetSystemUser(), Provider: Metadata.Provider }; // global-provider-ok: pre-auth edge runs under the server's single default provider
    }

    private async loadDistribution(slug: string): Promise<DistributionRecord | null> {
        const ctx = this.systemContext();
        const rv = RunViewOf(ctx);
        const dists = await rv.RunView<mjBizAppsVotingBallotDistributionEntity>(
            { EntityName: DISTRIBUTIONS, ExtraFilter: `Slug = ${SqlLiteral(slug)}`, ResultType: 'entity_object' },
            ctx.ContextUser
        );
        const entity = dists?.Success && dists.Results.length > 0 ? dists.Results[0] : null;
        if (!entity) return null;

        const elections = await rv.RunView<{ Name: string; Status: string }>(
            { EntityName: ELECTIONS, Fields: ['Name', 'Status'], ExtraFilter: `ID = ${SqlLiteral(entity.ElectionID)}`, ResultType: 'simple' },
            ctx.ContextUser
        );
        const election = elections?.Success && elections.Results.length > 0 ? elections.Results[0] : null;
        if (!election) return null;

        let methods = ParseAllowedMethods(entity.AllowedCredentialMethods);
        if (methods.length === 0) {
            const graph = await LoadElectionGraph(entity.ElectionID, ctx);
            if (!IsFailure(graph)) methods = (graph.Value.Configuration.AllowedCredentialMethodCodes ?? []).map((c) => c.toLowerCase());
        }
        return {
            Entity: entity,
            ElectionID: entity.ElectionID,
            ElectionName: election.Name,
            ElectionStatus: election.Status,
            AllowedOrigins: ParseAllowedOrigins(entity.AllowedOrigins),
            AllowedMethods: methods,
            Theme: parseTheme(entity.Theme),
            DefaultLanguage: entity.DefaultLanguage,
        };
    }
}
