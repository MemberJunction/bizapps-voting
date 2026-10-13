import { RegisterClass } from '@memberjunction/global';
import { BaseScheduledJob, type ScheduledJobExecutionContext } from '@memberjunction/scheduling-engine';
import { type MJScheduledJobEntity } from '@memberjunction/core-entities';
import { LogError, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { type NotificationContent, type ScheduledJobConfiguration, type ScheduledJobResult } from '@memberjunction/scheduling-base-types';
import { ReminderEngine, type ReminderOptions } from '../engines/reminder-engine.js';
import { IsFailure } from '../shared/types.js';
import { type JobFailure, BuildJobContext, LoadElectionsByStatus, LoadLastAuditTimes, SummarizeFailures } from './job-support.js';
import { NormalizeReminderDays, SelectElectionsForReminder } from './job-selection.js';

/** Schedule.Configuration for the reminder job. All optional. */
export interface ReminderJobConfig extends ScheduledJobConfiguration {
    /** Default reminder schedule for elections that set no `Reminders.DaysBeforeClose` of their own. */
    DaysBeforeClose?: number[];
    /** MJ Communication provider name; falls back to env VOTING_EMAIL_PROVIDER. */
    ProviderName?: string;
    /** Sender address; falls back to env VOTING_EMAIL_FROM. */
    From?: string;
    /** Public ballot page linked from the reminder. */
    BallotUrl?: string;
}

/** Validates a reminder job Configuration string. Pure; returns one message per problem. */
export function ValidateReminderConfiguration(configuration: string | null | undefined): Array<{ Field: string; Message: string }> {
    if (!configuration || configuration.trim() === '') return [];
    let parsed: unknown;
    try {
        parsed = JSON.parse(configuration);
    } catch (e) {
        return [{ Field: 'Configuration', Message: `Invalid Configuration JSON: ${e instanceof Error ? e.message : String(e)}` }];
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return [{ Field: 'Configuration', Message: 'Configuration must be a JSON object' }];
    }
    const problems: Array<{ Field: string; Message: string }> = [];
    const days = (parsed as ReminderJobConfig).DaysBeforeClose;
    if (days !== undefined) {
        if (!Array.isArray(days)) problems.push({ Field: 'DaysBeforeClose', Message: 'DaysBeforeClose must be an array of numbers' });
        else if (!days.every((d) => typeof d === 'number' && Number.isFinite(d) && d >= 0)) problems.push({ Field: 'DaysBeforeClose', Message: 'DaysBeforeClose values must be non-negative numbers' });
    }
    for (const key of ['ProviderName', 'From', 'BallotUrl'] as const) {
        const v = (parsed as ReminderJobConfig)[key];
        if (v !== undefined && typeof v !== 'string') problems.push({ Field: key, Message: `${key} must be a string` });
    }
    return problems;
}

function readConfig(schedule: MJScheduledJobEntity): ReminderJobConfig {
    if (!schedule.Configuration) return {};
    try {
        return JSON.parse(schedule.Configuration) as ReminderJobConfig;
    } catch {
        return {};
    }
}

/**
 * Reminder Sender: for Open elections that have crossed a reminder threshold (days before close, from the election's
 * own Configuration or this job's default) since their last reminder, asks the ReminderEngine to remind non-voters.
 * "Last reminder" is the election's most recent 'RemindersSent' audit event, so a threshold yields one reminder.
 */
@RegisterClass(BaseScheduledJob, 'ReminderSenderJob')
export class ReminderSenderJob extends BaseScheduledJob {
    public async Execute(context: ScheduledJobExecutionContext): Promise<ScheduledJobResult> {
        try {
            const ctx = BuildJobContext(context);
            const config = readConfig(context.Schedule);
            const now = new Date();
            const open = await LoadElectionsByStatus(ctx, ['Open']);
            const last = await LoadLastAuditTimes(ctx, open.map((e) => e.ID), 'RemindersSent');
            const due = SelectElectionsForReminder(open, last, NormalizeReminderDays(config.DaysBeforeClose), now);
            const options: ReminderOptions = { ProviderName: config.ProviderName, From: config.From, BallotUrl: config.BallotUrl };
            const failures: JobFailure[] = [];
            let sent = 0;
            let skipped = 0;
            let electionsReminded = 0;

            for (const e of due) {
                const res = await ReminderEngine.Instance.SendReminders(e.ID, ctx, options);
                if (IsFailure(res)) {
                    failures.push({ ElectionID: e.ID, Message: res.ErrorMessage });
                } else {
                    electionsReminded++;
                    sent += res.Value.Sent;
                    skipped += res.Value.Skipped;
                }
            }

            return {
                Success: failures.length === 0,
                ErrorMessage: SummarizeFailures(failures),
                Details: { SentCount: sent, SkippedCount: skipped, ElectionsReminded: electionsReminded, FailedCount: failures.length, ExecutedAt: now.toISOString() },
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`[ReminderSenderJob] ${message}`);
            return { Success: false, ErrorMessage: message };
        }
    }

    public ValidateConfiguration(schedule: MJScheduledJobEntity): ValidationResult {
        const result = new ValidationResult();
        for (const p of ValidateReminderConfiguration(schedule.Configuration)) {
            result.Errors.push(new ValidationErrorInfo(p.Field, p.Message, null, ValidationErrorType.Failure));
        }
        result.Success = result.Errors.length === 0;
        return result;
    }

    public FormatNotification(_context: ScheduledJobExecutionContext, result: ScheduledJobResult): NotificationContent {
        const sent = (result.Details?.['SentCount'] as number | undefined) ?? 0;
        return {
            Subject: `Reminder Sender: ${sent} reminder(s) sent`,
            Body: `Voting reminders sent: ${sent}${result.ErrorMessage ? `\n\nProblems: ${result.ErrorMessage}` : ''}`,
            Priority: result.Success ? 'Normal' : 'High',
        };
    }
}
