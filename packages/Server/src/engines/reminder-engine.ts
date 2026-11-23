/**
 * ReminderEngine: reminders to voters who have not voted yet (design section 7).
 *
 * Who is a non-voter comes from the poll book alone: Eligible roll entries with no Participation row. The engine never reads
 * the ballot box and the email says nothing about anyone's vote. Mail goes through MJ Communication (CommunicationEngine);
 * the provider and sender come from the options, else the environment (VOTING_EMAIL_PROVIDER, VOTING_EMAIL_FROM).
 *
 * The reminder points voters at the public ballot page (`BallotUrl`) and tells them to use the personal link they were
 * emailed; it does not mint new credentials (CredentialEngine owns that).
 */

import { BaseSingleton } from '@memberjunction/global';
import { CommunicationEngine } from '@memberjunction/communication-engine';
import { Message } from '@memberjunction/communication-types';
import { ElectionAudit } from '../shared/audit.js';
import { type EngineResult, type VotingContext, Fail, Ok, RunViewOf } from '../shared/types.js';
import { SqlLiteral } from '../shared/voter-identity.js';
import { LoadElectionEntity } from './person-support.js';

const VOTERS_ENTITY = 'MJ_BizApps_Voting: Eligible Voters';
const PARTICIPATIONS_ENTITY = 'MJ_BizApps_Voting: Participations';
const PEOPLE_ENTITY = 'MJ_BizApps_Common: People';
const BATCH = 200;

export interface ReminderOptions {
    /** MJ Communication provider name (for example 'SendGrid'). Defaults to env VOTING_EMAIL_PROVIDER. */
    ProviderName?: string;
    /** Sender address. Defaults to env VOTING_EMAIL_FROM. */
    From?: string;
    /** Message type on the provider. Default 'Email'. */
    ProviderMessageType?: string;
    /** Public ballot page to link to. */
    BallotUrl?: string;
}

export interface ReminderValue {
    Sent: number;
    Skipped: number;
}

interface VoterRef {
    ID: string;
    PersonID: string;
}

interface PersonContact {
    ID: string;
    Email: string | null;
    DisplayName: string;
}

function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Roll entries with no poll-book row. Pure. */
export function SelectNonVoters(roll: readonly VoterRef[], votedVoterIDs: ReadonlySet<string>): VoterRef[] {
    return roll.filter((v) => !votedVoterIDs.has(v.ID.toLowerCase()));
}

export function BuildReminderText(electionName: string, closesAt: Date | null, ballotUrl: string | undefined): { Subject: string; Text: string; Html: string } {
    const closing = closesAt ? ` Voting closes ${closesAt.toUTCString()}.` : '';
    const link = ballotUrl ? ` Cast your ballot here: ${ballotUrl}` : '';
    const text = `You have not yet voted in "${electionName}".${closing} Please use the personal voting link you were emailed.${link}`;
    const html = `<p>You have not yet voted in <strong>${escapeHtml(electionName)}</strong>.${escapeHtml(closing)} Please use the personal voting link you were emailed.${
        ballotUrl ? ` <a href="${escapeHtml(ballotUrl)}">Open the ballot page</a>.` : ''
    }</p>`;
    return { Subject: `Reminder: vote in ${electionName}`, Text: text, Html: html };
}

export class ReminderEngine extends BaseSingleton<ReminderEngine> {
    protected constructor() {
        super();
    }

    public static get Instance(): ReminderEngine {
        return super.getInstance<ReminderEngine>();
    }

    public async SendReminders(electionID: string, ctx: VotingContext, options: ReminderOptions = {}): Promise<EngineResult<ReminderValue>> {
        const election = await LoadElectionEntity(electionID, ctx);
        if (!election) return Fail('ElectionNotFound', 'The election was not found.');
        if (election.Status !== 'Open') return Fail('NotOpen', 'Reminders are sent only while voting is open.');
        const providerName = options.ProviderName ?? process.env.VOTING_EMAIL_PROVIDER;
        const from = options.From ?? process.env.VOTING_EMAIL_FROM;
        if (!providerName || !from) return Fail('NoMailProvider', 'No email provider or sender is configured for reminders.');

        const rv = RunViewOf(ctx);
        const roll = await rv.RunView<VoterRef>(
            { EntityName: VOTERS_ENTITY, ExtraFilter: `ElectionID = ${SqlLiteral(election.ID)} AND Status = 'Eligible'`, Fields: ['ID', 'PersonID'], ResultType: 'simple' },
            ctx.ContextUser
        );
        const voted = await rv.RunView<{ EligibleVoterID: string }>(
            { EntityName: PARTICIPATIONS_ENTITY, ExtraFilter: `ElectionID = ${SqlLiteral(election.ID)}`, Fields: ['EligibleVoterID'], ResultType: 'simple' },
            ctx.ContextUser
        );
        if (!roll.Success || !voted.Success) return Fail('LoadFailed', 'The poll book could not be read.');
        const nonVoters = SelectNonVoters(roll.Results, new Set(voted.Results.map((v) => v.EligibleVoterID.toLowerCase())));

        const contacts = await this.loadContacts(nonVoters.map((v) => v.PersonID), ctx);
        const content = BuildReminderText(election.Name, election.ClosesAt ? new Date(election.ClosesAt) : null, options.BallotUrl);

        const comms = CommunicationEngine.Instance;
        await comms.Config(false, ctx.ContextUser, ctx.Provider);
        let sent = 0;
        let skipped = 0;
        for (const voter of nonVoters) {
            const contact = contacts.get(voter.PersonID.toLowerCase());
            if (!contact?.Email) {
                skipped++;
                continue;
            }
            try {
                const message = new Message();
                message.From = from;
                message.To = contact.Email;
                message.Subject = content.Subject;
                message.Body = content.Text;
                message.HTMLBody = content.Html;
                const result = await comms.SendSingleMessage(providerName, options.ProviderMessageType ?? 'Email', message);
                if (result.Success) sent++;
                else skipped++;
            } catch {
                skipped++;
            }
        }
        await ElectionAudit.Record(ctx, election.ID, 'RemindersSent', { Sent: sent, Skipped: skipped });
        return Ok({ Sent: sent, Skipped: skipped });
    }

    private async loadContacts(personIDs: string[], ctx: VotingContext): Promise<Map<string, PersonContact>> {
        const map = new Map<string, PersonContact>();
        const rv = RunViewOf(ctx);
        for (let i = 0; i < personIDs.length; i += BATCH) {
            const ids = personIDs.slice(i, i + BATCH).map(SqlLiteral).join(',');
            const res = await rv.RunView<PersonContact>(
                { EntityName: PEOPLE_ENTITY, ExtraFilter: `ID IN (${ids})`, Fields: ['ID', 'Email', 'DisplayName'], ResultType: 'simple' },
                ctx.ContextUser
            );
            if (res.Success) for (const p of res.Results) map.set(p.ID.toLowerCase(), p);
        }
        return map;
    }
}
