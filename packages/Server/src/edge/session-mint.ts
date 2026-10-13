/**
 * The MJServer-dependent half of the guest mint. Kept tiny and separate so unit tests can mock this module and never
 * load '@memberjunction/server' (whose entry point reads the whole API server configuration at import time).
 *
 * Sourcing mirrors WidgetSessionService.mintToken:
 *   issuer     = configInfo.publicUrl, else baseUrl:graphqlPort + graphqlRootPath (what the magic-link auth provider
 *                is registered with in MJServer's index.ts as `oauthPublicUrl`)
 *   audience   = configInfo.magicLink.audience (the provider's audience)
 *   email      = configInfo.widget.anonymousEmail (the shared Anonymous principal)
 *   signature  = MagicLinkKeyManager.Instance.Sign (the key the provider's JWKS publishes)
 * The application and guest role are this app's, not a widget instance's.
 */
import { Metadata } from '@memberjunction/core';
import { BuildSessionClaims, MagicLinkKeyManager, configInfo } from '@memberjunction/server';
import { randomBytes } from 'node:crypto';
import { BuildBallotSessionClaims, ResolveSessionTtlMinutes } from './session-claims.js';

export interface MintSettings {
    SessionTtlMinutes?: unknown;
    'voting.sessionTtlMinutes'?: unknown;
    /** Application the session is scoped to. Default 'BizApps Voting'. */
    ApplicationName?: string;
    /** Role synthesized for the anonymous session. Default: MJ's magic-link baseline role. */
    GuestRoleName?: string;
}

export interface MintedSession {
    Token: string;
    ExpiresAt: string;
}

/** Thrown for a deployment that cannot mint (magic links off, application missing). The caller reports a generic 503. */
export class SessionMintUnavailableError extends Error {}

export function MintBallotSession(electionID: string, eligibleVoterID: string, settings: MintSettings): MintedSession {
    const magicLink = configInfo.magicLink;
    if (!magicLink?.enabled) {
        throw new SessionMintUnavailableError('magicLink.enabled is false: the magic-link auth provider that validates ballot sessions is not registered.');
    }
    const appName = settings.ApplicationName ?? 'BizApps Voting';
    const app = Metadata.Provider.Applications.find((a) => a.Name === appName); // global-provider-ok: pre-auth server-side mint under the single default provider
    if (!app) {
        throw new SessionMintUnavailableError(`Application "${appName}" is not in metadata.`);
    }
    const issuer = configInfo.publicUrl || `${configInfo.baseUrl}:${configInfo.graphqlPort}${configInfo.graphqlRootPath || ''}`;
    const claims = BuildBallotSessionClaims(
        {
            Issuer: issuer,
            Audience: magicLink.audience,
            AnonymousEmail: configInfo.widget.anonymousEmail,
            ApplicationID: app.ID,
            GuestRoleName: settings.GuestRoleName ?? magicLink.restrictedRoleName,
            ElectionID: electionID,
            EligibleVoterID: eligibleVoterID,
            SessionID: randomBytes(24).toString('base64url'),
            NowSeconds: Math.floor(Date.now() / 1000),
            TtlSeconds: ResolveSessionTtlMinutes(settings) * 60,
        },
        BuildSessionClaims
    );
    return { Token: MagicLinkKeyManager.Instance.Sign(claims), ExpiresAt: new Date(claims.exp * 1000).toISOString() };
}
