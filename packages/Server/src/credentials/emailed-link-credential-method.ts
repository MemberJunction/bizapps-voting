/**
 * EmailedLinkCredentialMethod: a single-use, election-scoped ballot link sent by email.
 *
 * Issue: 32 random bytes as a base64url token; only its SHA-256 is stored (VoterCredential.SecretHash); the link carries
 * the raw token in the URL FRAGMENT (`/vote/<slug>#t=<token>`), which never reaches server logs or Referer headers.
 * Verify: hash match, not revoked, not expired, not used. The first successful verification (which is the session mint)
 * sets RedeemedAt, so a forwarded link that was already used is refused.
 */

import { LogError } from '@memberjunction/core';
import { CommunicationEngine } from '@memberjunction/communication-engine';
import { Message } from '@memberjunction/communication-types';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import {
    type mjBizAppsVotingBallotDistributionEntity,
    type mjBizAppsVotingVoterCredentialEntity,
    type mjBizAppsVotingVoterCredentialMethodEntity,
} from '@mj-biz-apps/voting-entities';
import { type EngineResult, Fail, Ok, SqlLiteral, type VotingContext, RunViewOf } from '../shared/index.js';
import { AsTrimmedString, ParseJsonObject } from '../eligibility/json-settings.js';
import { BaseVoterCredentialMethod, InvalidCredential } from './base-voter-credential-method.js';
import { BuildBallotLink, ConstantTimeEqualHex, GenerateToken, HashSecret } from './credential-crypto.js';
import { InsertCredential, RevokeLiveCredentials, VOTER_CREDENTIALS_ENTITY } from './credential-store.js';
import {
    type CredentialIssueOptions,
    type CredentialIssueResult,
    type CredentialIssueTarget,
    type VerifiedVoter,
    type VoterCredentialPresentation,
} from './credential-types.js';
import { WithKeyedLock } from './keyed-lock.js';
import { LoadEligibleVoter } from './roll-lookup.js';

const MAX_TOKEN_LENGTH = 256;

/** The sender chosen for ballot emails. */
export interface EmailSender {
    ProviderName: string;
    FromAddress: string;
    FromName?: string;
    Subject: string;
}

/** Picks the MJ Communication provider and sender: the method Configuration wins, else the first active provider that can send Email. */
export function ResolveEmailSender(method: mjBizAppsVotingVoterCredentialMethodEntity, electionName: string): EmailSender | null {
    const config = ParseJsonObject(method.Configuration);
    const fromAddress = AsTrimmedString(config.FromAddress);
    if (!fromAddress) return null;
    const providers = CommunicationEngine.Instance.Providers;
    const wanted = AsTrimmedString(config.ProviderName);
    const provider = wanted
        ? providers.find((p) => p.Name === wanted)
        : providers.find((p) => p.Status === 'Active' && p.SupportsSending && p.MessageTypes.some((t) => t.Name.trim().toLowerCase() === 'email'));
    if (!provider) return null;
    return {
        ProviderName: provider.Name,
        FromAddress: fromAddress,
        FromName: AsTrimmedString(config.FromName) ?? undefined,
        Subject: AsTrimmedString(config.Subject) ?? `Your ballot: ${electionName}`,
    };
}

function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

@RegisterClass(BaseVoterCredentialMethod, 'EmailedLinkCredentialMethod')
export class EmailedLinkCredentialMethod extends BaseVoterCredentialMethod {
    public async Issue(target: CredentialIssueTarget, options: CredentialIssueOptions, ctx: VotingContext): Promise<CredentialIssueResult> {
        if (!target.Email) return { Status: 'Skipped', Reason: 'NoEmail' };
        if (!options.Distribution) return { Status: 'Skipped', Reason: 'NoActiveDistribution' };
        if (!options.BaseUrl) return { Status: 'Skipped', Reason: 'NoBaseUrl' };

        await CommunicationEngine.Instance.Config(false, ctx.ContextUser, ctx.Provider);
        const sender = ResolveEmailSender(options.Method, options.Election.Name);

        const token = GenerateToken();
        if (sender) await RevokeLiveCredentials(target.Voter.ID, options.Method.ID, ctx); // only replace a link we can actually deliver
        await InsertCredential(
            {
                EligibleVoterID: target.Voter.ID,
                VoterCredentialMethodID: options.Method.ID,
                SecretHash: HashSecret(token),
                ExpiresAt: options.Election.ClosesAt,
            },
            ctx
        );
        if (!sender) return { Status: 'Skipped', Reason: 'NoEmailProvider' };

        const link = BuildBallotLink(options.BaseUrl, options.Distribution.Slug, token);
        const message = new Message();
        message.From = sender.FromAddress;
        if (sender.FromName) message.FromName = sender.FromName;
        message.To = target.Email;
        message.Subject = sender.Subject;
        message.Body = `You are invited to vote in "${options.Election.Name}".\n\nYour personal ballot link (it works once; do not forward it):\n${link}\n`;
        message.HTMLBody = `<p>You are invited to vote in <strong>${escapeHtml(options.Election.Name)}</strong>.</p><p><a href="${escapeHtml(link)}">Open your ballot</a></p><p>This personal link works once. Please do not forward it.</p>`;
        try {
            const sent = await CommunicationEngine.Instance.SendSingleMessage(sender.ProviderName, 'Email', message);
            if (!sent.Success) return { Status: 'Skipped', Reason: 'SendFailed' };
        } catch (e) {
            LogError(`Voting: ballot email send failed: ${e instanceof Error ? e.message : String(e)}`);
            return { Status: 'Skipped', Reason: 'SendFailed' };
        }
        return { Status: 'Issued' };
    }

    public async Verify(
        presentation: VoterCredentialPresentation,
        _distribution: mjBizAppsVotingBallotDistributionEntity,
        electionID: string,
        ctx: VotingContext,
        method: mjBizAppsVotingVoterCredentialMethodEntity
    ): Promise<EngineResult<VerifiedVoter>> {
        const token = presentation.Token?.trim();
        if (!token || token.length > MAX_TOKEN_LENGTH) return InvalidCredential<VerifiedVoter>();
        const digest = HashSecret(token);

        const rv = RunViewOf(ctx);
        const found = await rv.RunView<mjBizAppsVotingVoterCredentialEntity>(
            {
                EntityName: VOTER_CREDENTIALS_ENTITY,
                ExtraFilter: `SecretHash = ${SqlLiteral(digest)} AND VoterCredentialMethodID = ${SqlLiteral(method.ID)}`,
                MaxRows: 2,
                ResultType: 'entity_object',
            },
            ctx.ContextUser
        );
        if (!found.Success || found.Results.length !== 1) return InvalidCredential<VerifiedVoter>();
        const credentialID = found.Results[0].ID;

        return WithKeyedLock(`cred:${credentialID.toLowerCase()}`, async () => {
            const credential = await ctx.Provider.GetEntityObject<mjBizAppsVotingVoterCredentialEntity>(VOTER_CREDENTIALS_ENTITY, ctx.ContextUser);
            if (!(await credential.Load(credentialID))) return InvalidCredential<VerifiedVoter>();
            if (!credential.SecretHash || !ConstantTimeEqualHex(credential.SecretHash, digest)) return InvalidCredential<VerifiedVoter>();
            if (credential.RevokedAt) return Fail<VerifiedVoter>('CredentialRevoked', 'This ballot link is no longer valid.');
            if (credential.ExpiresAt && credential.ExpiresAt.getTime() <= Date.now()) return Fail<VerifiedVoter>('CredentialExpired', 'This ballot link has expired.');
            if (credential.RedeemedAt) return Fail<VerifiedVoter>('CredentialUsed', 'This ballot link has already been used.');

            const voter = await LoadEligibleVoter(credential.EligibleVoterID, ctx);
            if (!voter || voter.Status !== 'Eligible' || !UUIDsEqual(voter.ElectionID, electionID)) return InvalidCredential<VerifiedVoter>();

            credential.RedeemedAt = new Date();
            if (!(await credential.Save())) return Fail<VerifiedVoter>('CredentialUpdateFailed', 'The ballot link could not be redeemed. Please try again.');
            return Ok({ EligibleVoterID: voter.ID });
        });
    }
}
