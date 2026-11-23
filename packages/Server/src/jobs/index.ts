/**
 * Scheduled jobs for BizApps Voting
 * These jobs are registered as @RegisterClass(BaseScheduledJob) decorators
 * and are discovered/invoked by the scheduling engine at MJAPI startup.
 */

export * from './election-scheduler.job.js';
export * from './result-snapshot-publisher.job.js';
export * from './reminder-sender.job.js';

export function LoadVotingJobs(): void {
    // No-op: importing this module registers all the job classes via @RegisterClass decorators
}
