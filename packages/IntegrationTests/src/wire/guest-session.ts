/**
 * Guest ballot sessions and magic-link sessions, obtained the way production obtains them.
 *
 * A guest ballot session is NEVER self-signed here. The voter presents a credential the voting credential flow issued
 * (for the wire tier: a second-factor PIN from `Voting.IssueSecondFactorPins`) to `POST /vote/session`, the public edge
 * verifies it against the distribution and mints an election-scoped guest JWT with the server's own magic-link key.
 *
 * A magic-link session for an internal persona uses MJ's invite flow: an Owner creates an invite
 * (`POST /magic-link/create`), the invitee redeems the single-use token (`POST /magic-link/redeem?format=json`) and gets a
 * session JWT scoped to one Application and one role: the same token Explorer reads from `#token=<jwt>`.
 */
import { ResolveWireConfig } from './wire-config.js';

// ─── The /vote edge ──────────────────────────────────────────────────────────

export interface EdgeCredential {
    /** Roster key the voter presents with the PIN. */
    SourceKey: string;
    Pin: string;
}

export interface GuestSession {
    /** String discriminant: boolean discriminants do not narrow under this repo's non-strict tsconfig. */
    Kind: 'session';
    Token: string;
    ExpiresAt: string;
    ElectionID: string;
}

export interface EdgeRefusal {
    Kind: 'refused';
    Status: number;
    /** Stable edge code, for example `sign_in_failed`, `not_found`, `rate_limited`. */
    Code: string;
    ErrorMessage: string;
}

interface EdgeBody {
    Token?: string;
    ExpiresAt?: string;
    ElectionID?: string;
    Code?: string;
    ErrorMessage?: string;
}

/** `POST /vote/session` with a second-factor credential. Returns the refusal instead of throwing on a non-2xx answer. */
export async function RequestGuestSession(slug: string, credential: EdgeCredential, options: { MethodCode?: string; Origin?: string } = {}): Promise<GuestSession | EdgeRefusal> {
    const { BaseUrl } = ResolveWireConfig();
    const res = await fetch(`${BaseUrl}/vote/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(options.Origin ? { origin: options.Origin } : {}) },
        body: JSON.stringify({ Slug: slug, MethodCode: options.MethodCode ?? 'second-factor', Credential: { SourceKey: credential.SourceKey, Pin: credential.Pin } }),
    });
    const body = (await res.json().catch(() => ({}))) as EdgeBody;
    if (res.ok && body.Token && body.ExpiresAt && body.ElectionID) {
        return { Kind: 'session', Token: body.Token, ExpiresAt: body.ExpiresAt, ElectionID: body.ElectionID };
    }
    return { Kind: 'refused', Status: res.status, Code: body.Code ?? 'unknown', ErrorMessage: body.ErrorMessage ?? `HTTP ${res.status}` };
}

/** Like {@link RequestGuestSession} but throws with the edge's code when the sign-in is refused. */
export async function GetGuestSession(slug: string, credential: EdgeCredential, options: { MethodCode?: string; Origin?: string } = {}): Promise<GuestSession> {
    const result = await RequestGuestSession(slug, credential, options);
    if (result.Kind === 'refused') throw new Error(`guest sign-in refused by /vote/session: ${result.Status} ${result.Code}: ${result.ErrorMessage}`);
    return result;
}

export interface DistributionInfo {
    ElectionName: string;
    AllowedMethods: string[];
    GraphQLUrl?: string;
}

/** `GET /vote/:slug/info`: the public description of an open ballot distribution. Null when it is not public. */
export async function GetDistributionInfo(slug: string): Promise<DistributionInfo | null> {
    const { BaseUrl } = ResolveWireConfig();
    const res = await fetch(`${BaseUrl}/vote/${encodeURIComponent(slug)}/info`);
    return res.ok ? ((await res.json()) as DistributionInfo) : null;
}

// ─── Magic-link invites (internal personas) ──────────────────────────────────

export interface MagicLinkInvite {
    InviteID: string;
    /** The single-use raw token (returned only because no email provider is configured on the test host). */
    RawToken: string;
}

export interface MagicLinkSession {
    Token: string;
    ExpiresAt: string;
    ApplicationName?: string;
    Email?: string;
}

interface CreateInviteBody {
    success: boolean;
    inviteId?: string;
    rawToken?: string;
    error?: string;
    errorCode?: string;
}

interface RedeemBody {
    success: boolean;
    token?: string;
    expiresAt?: string;
    applicationName?: string;
    email?: string;
    error?: string;
    errorCode?: string;
}

/**
 * `POST /magic-link/create`. The caller authenticates with the system key (an Owner: the only identity allowed to issue
 * invites unless `inviteIssuerRoleNames` says otherwise). `ApplicationId` and `RoleId` are the MJ Application and Role ids.
 */
export async function CreateMagicLinkInvite(
    systemKey: string,
    invite: { Email: string; ApplicationId: string; RoleId: string; FirstName?: string; LastName?: string; ExpiresInHours?: number }
): Promise<MagicLinkInvite> {
    const { BaseUrl } = ResolveWireConfig();
    const res = await fetch(`${BaseUrl}/magic-link/create`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-mj-api-key': systemKey },
        body: JSON.stringify({ email: invite.Email, ApplicationId: invite.ApplicationId, RoleId: invite.RoleId, firstName: invite.FirstName, lastName: invite.LastName, ExpiresInHours: invite.ExpiresInHours }),
    });
    const body = (await res.json().catch(() => ({ success: false }))) as CreateInviteBody;
    if (!res.ok || !body.success || !body.inviteId || !body.rawToken) {
        throw new Error(`magic-link create refused: ${res.status} ${body.errorCode ?? ''} ${body.error ?? ''}`.trim());
    }
    return { InviteID: body.inviteId, RawToken: body.rawToken };
}

/** `POST /magic-link/redeem?format=json`: consumes the invite and returns the session JWT (what Explorer reads from `#token=`). */
export async function RedeemMagicLink(rawToken: string): Promise<MagicLinkSession> {
    const { BaseUrl } = ResolveWireConfig();
    const res = await fetch(`${BaseUrl}/magic-link/redeem?format=json`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: rawToken }),
    });
    const body = (await res.json().catch(() => ({ success: false }))) as RedeemBody;
    if (!res.ok || !body.success || !body.token || !body.expiresAt) {
        throw new Error(`magic-link redeem refused: ${res.status} ${body.errorCode ?? ''} ${body.error ?? ''}`.trim());
    }
    return { Token: body.token, ExpiresAt: body.expiresAt, ApplicationName: body.applicationName, Email: body.email };
}
