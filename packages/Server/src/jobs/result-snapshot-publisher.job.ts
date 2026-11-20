import { RegisterClass } from '@memberjunction/global';
import { BaseScheduledJob, type ScheduledJobExecutionContext } from '@memberjunction/scheduling-engine';
import { type MJScheduledJobEntity } from '@memberjunction/core-entities';
import { LogError, ValidationResult } from '@memberjunction/core';
import { type NotificationContent, type ScheduledJobResult } from '@memberjunction/scheduling-base-types';
import { ResultsEngine } from '../engines/results-engine.js';
import { IsFailure } from '../shared/types.js';
import { type JobFailure, BuildJobContext, LoadElectionsByStatus, SummarizeFailures } from './job-support.js';
import { SelectElectionsForSnapshot } from './job-selection.js';

/**
 * Result Snapshot Publisher: asks the ResultsEngine to publish a running-results snapshot for every Open election that
 * shows running results. The engine applies the batch policy (minimum cast, new-ballot and minimum-minute thresholds,
 * weight-class suppression), so running this job often is safe.
 */
@RegisterClass(BaseScheduledJob, 'ResultSnapshotPublisherJob')
export class ResultSnapshotPublisherJob extends BaseScheduledJob {
    public async Execute(context: ScheduledJobExecutionContext): Promise<ScheduledJobResult> {
        try {
            const ctx = BuildJobContext(context);
            const now = new Date();
            const elections = SelectElectionsForSnapshot(await LoadElectionsByStatus(ctx, ['Open']), now);
            const failures: JobFailure[] = [];
            let published = 0;
            let skipped = 0;

            for (const e of elections) {
                const res = await ResultsEngine.Instance.PublishSnapshot(e.ID, ctx);
                if (IsFailure(res)) failures.push({ ElectionID: e.ID, Message: res.ErrorMessage });
                else if (res.Value.Published) published++;
                else skipped++;
            }

            return {
                Success: failures.length === 0,
                ErrorMessage: SummarizeFailures(failures),
                Details: { PublishedCount: published, SkippedCount: skipped, FailedCount: failures.length, ExecutedAt: now.toISOString() },
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`[ResultSnapshotPublisherJob] ${message}`);
            return { Success: false, ErrorMessage: message };
        }
    }

    public ValidateConfiguration(_schedule: MJScheduledJobEntity): ValidationResult {
        const result = new ValidationResult();
        result.Success = true;
        return result;
    }

    public FormatNotification(_context: ScheduledJobExecutionContext, result: ScheduledJobResult): NotificationContent {
        const published = (result.Details?.['PublishedCount'] as number | undefined) ?? 0;
        return {
            Subject: `Result Snapshot Publisher: ${published} snapshot(s) published`,
            Body: `Result snapshots published: ${published}${result.ErrorMessage ? `\n\nProblems: ${result.ErrorMessage}` : ''}`,
            Priority: result.Success ? 'Low' : 'High',
        };
    }
}
