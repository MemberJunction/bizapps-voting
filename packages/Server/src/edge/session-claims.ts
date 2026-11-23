/**
 * Builds the claims of a ballot guest session. Pure: the MJServer claims builder is passed in, so this file (and its
 * tests) never load '@memberjunction/server'. The real builder is wired in `session-mint.ts`.
 *
 * The shape mirrors MJ's public widget guest mint (realtimeWidget/widgetCore.ts BuildWidgetGuestClaims): a direct-mint
 * anonymous magic-link session. The token's email is ALWAYS the shared Anonymous principal, so the auth middleware can
 * never resolve it to a real account; what makes it a ballot session is the signed scope entry
 * (resourceType = VotingBallotSession, resourceId = `electionId:eligibleVoterId`), which MJ's session builder
 * (buildMagicLinkSessionUser) copies onto the principal as MagicLinkScope.
 */
import type { MagicLinkJWTClaims } from '@memberjunction/server';
import { VoterIdentityResolver } from '../shared/voter-identity.js';

/** The subset of MJ's BuildSessionClaims arguments this edge uses. */
export interface SessionClaimsArgs {
    issuer: string;
    audience: string;
    inviteId: string;
    email: string;
    applicationId: string;
    roleName: string;
    anonymous?: boolean;
    sessionId?: string;
    resourceType?: string;
    resourceId?: string;
    nowSeconds: number;
    ttlSeconds: number;
}

export type SessionClaimsBuilder = (args: SessionClaimsArgs) => MagicLinkJWTClaims;

export interface BallotSessionClaimsInput {
    /** The token issuer: MJ's public URL (the magic-link auth provider's configured issuer). */
    Issuer: string;
    /** The magic-link audience. */
    Audience: string;
    /** The shared Anonymous principal's email. */
    AnonymousEmail: string;
    ApplicationID: string;
    /** The role synthesized for the anonymous session. */
    GuestRoleName: string;
    ElectionID: string;
    EligibleVoterID: string;
    /** Opaque per-session id (forensics only). */
    SessionID: string;
    NowSeconds: number;
    TtlSeconds: number;
}

/** Default and bounds for the session lifetime (app config `voting.sessionTtlMinutes`). */
export const DEFAULT_SESSION_TTL_MINUTES = 30;
const MIN_SESSION_TTL_MINUTES = 1;
const MAX_SESSION_TTL_MINUTES = 240;

/** Reads the TTL from extension settings (`SessionTtlMinutes`, or the dotted `voting.sessionTtlMinutes`); bad values fall back to 30. */
export function ResolveSessionTtlMinutes(settings: { SessionTtlMinutes?: unknown; 'voting.sessionTtlMinutes'?: unknown }): number {
    const raw = settings['voting.sessionTtlMinutes'] ?? settings.SessionTtlMinutes;
    const n = typeof raw === 'string' ? Number(raw) : raw;
    if (typeof n !== 'number' || !Number.isFinite(n)) return DEFAULT_SESSION_TTL_MINUTES;
    return Math.min(MAX_SESSION_TTL_MINUTES, Math.max(MIN_SESSION_TTL_MINUTES, Math.floor(n)));
}

export function BuildBallotSessionClaims(input: BallotSessionClaimsInput, build: SessionClaimsBuilder): MagicLinkJWTClaims {
    return build({
        issuer: input.Issuer,
        audience: input.Audience,
        // No invite row exists for a direct mint; the opaque session id is the subject discriminator and scope-entry id.
        inviteId: input.SessionID,
        email: input.AnonymousEmail,
        applicationId: input.ApplicationID,
        roleName: input.GuestRoleName,
        anonymous: true,
        sessionId: input.SessionID,
        resourceType: VoterIdentityResolver.GuestResourceType,
        resourceId: VoterIdentityResolver.EncodeGuestResource(input.ElectionID, input.EligibleVoterID),
        nowSeconds: input.NowSeconds,
        ttlSeconds: input.TtlSeconds,
    });
}
