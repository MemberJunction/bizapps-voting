import { RegisterClass } from '@memberjunction/global';
import { BaseScheduledJob, type ScheduledJobExecutionContext } from '@memberjunction/scheduling-engine';
import { type MJScheduledJobEntity } from '@memberjunction/core-entities';
import { LogError, ValidationResult } from '@memberjunction/core';
import { type NotificationContent, type ScheduledJobResult } from '@memberjunction/scheduling-base-types';
import { ElectionAdministrationEngine } from '../engines/election-administration-engine.js';
import { IsFailure } from '../shared/types.js';
import { type JobFailure, BuildJobContext, LoadElectionsByStatus, SummarizeFailures } from './job-support.js';
import { SelectElectionsToClose, SelectElectionsToOpen } from './job-selection.js';

/**
 * Election Scheduler: opens Ready elections whose OpensAt has arrived and closes Open elections whose ClosesAt has
 * passed. Idempotent - an election that is already opened or closed no longer matches the selection.
 */
@RegisterClass(BaseScheduledJob, 'ElectionSchedulerJob')
export class ElectionSchedulerJob extends BaseScheduledJob {
    public async Execute(context: ScheduledJobExecutionContext): Promise<ScheduledJobResult> {
        try {
            const ctx = BuildJobContext(context);
            const now = new Date();
            const elections = await LoadElectionsByStatus(ctx, ['Ready', 'Open']);
            const engine = ElectionAdministrationEngine.Instance;
            const failures: JobFailure[] = [];
            let opened = 0;
            let closed = 0;

            for (const e of SelectElectionsToOpen(elections, now)) {
                const res = await engine.OpenElection(e.ID, ctx);
                if (IsFailure(res)) failures.push({ ElectionID: e.ID, Message: `open: ${res.ErrorMessage}` });
                else opened++;
            }
            for (const e of SelectElectionsToClose(elections, now)) {
                const res = await engine.CloseElection(e.ID, ctx);
                if (IsFailure(res)) failures.push({ ElectionID: e.ID, Message: `close: ${res.ErrorMessage}` });
                else closed++;
            }

            const errorMessage = SummarizeFailures(failures);
            return {
                Success: failures.length === 0,
                ErrorMessage: errorMessage,
                Details: { OpenedCount: opened, ClosedCount: closed, FailedCount: failures.length, ExecutedAt: now.toISOString() },
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`[ElectionSchedulerJob] ${message}`);
            return { Success: false, ErrorMessage: message };
        }
    }

    public ValidateConfiguration(_schedule: MJScheduledJobEntity): ValidationResult {
        const result = new ValidationResult();
        result.Success = true;
        return result;
    }

    public FormatNotification(_context: ScheduledJobExecutionContext, result: ScheduledJobResult): NotificationContent {
        const opened = (result.Details?.['OpenedCount'] as number | undefined) ?? 0;
        const closed = (result.Details?.['ClosedCount'] as number | undefined) ?? 0;
        return {
            Subject: `Election Scheduler: ${opened} opened, ${closed} closed`,
            Body: `Elections opened: ${opened}\nElections closed: ${closed}${result.ErrorMessage ? `\n\nProblems: ${result.ErrorMessage}` : ''}`,
            Priority: result.Success ? 'Normal' : 'High',
        };
    }
}
