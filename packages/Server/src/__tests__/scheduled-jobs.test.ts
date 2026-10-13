import { describe, it, expect } from 'vitest';
import type { MJScheduledJobEntity } from '@memberjunction/core-entities';
import type { ScheduledJobExecutionContext } from '@memberjunction/scheduling-engine';
import { ReminderSenderJob, ValidateReminderConfiguration } from '../jobs/reminder-sender.job.js';
import { ElectionSchedulerJob } from '../jobs/election-scheduler.job.js';
import { ResultSnapshotPublisherJob } from '../jobs/result-snapshot-publisher.job.js';
import {
    DueReminderThreshold,
    type JobElectionRow,
    NormalizeReminderDays,
    ParseElectionReminderDays,
    SelectElectionsForReminder,
    SelectElectionsForSnapshot,
    SelectElectionsToClose,
    SelectElectionsToOpen,
} from '../jobs/job-selection.js';

const NOW = new Date('2026-10-12T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const at = (offsetMs: number): Date => new Date(NOW.getTime() + offsetMs);

function election(over: Partial<JobElectionRow> & { ID: string }): JobElectionRow {
    return { Name: 'E', Status: 'Open', OpensAt: null, ClosesAt: null, ResultsTiming: 'AfterClose', AssuranceTier: 'Standard', Configuration: null, ...over };
}

function scheduleWith(configuration: string | null): MJScheduledJobEntity {
    return { Configuration: configuration } as unknown as MJScheduledJobEntity;
}

const CONTEXT = { Schedule: { Name: 'S' } } as unknown as ScheduledJobExecutionContext;

describe('ReminderSenderJob.ValidateConfiguration', () => {
    const job = new ReminderSenderJob();
    const check = (cfg: string | null) => job.ValidateConfiguration(scheduleWith(cfg));

    it('accepts empty and null configuration', () => {
        expect(check('').Success).toBe(true);
        expect(check(null).Success).toBe(true);
    });
    it('accepts valid and empty DaysBeforeClose', () => {
        expect(check(JSON.stringify({ DaysBeforeClose: [7, 3, 1] })).Success).toBe(true);
        expect(check(JSON.stringify({ DaysBeforeClose: [] })).Success).toBe(true);
    });
    it('rejects non-array DaysBeforeClose', () => {
        const r = check(JSON.stringify({ DaysBeforeClose: '7' }));
        expect(r.Success).toBe(false);
        expect(r.Errors[0].Message).toContain('array');
    });
    it('rejects negative values', () => {
        const r = check(JSON.stringify({ DaysBeforeClose: [7, -3] }));
        expect(r.Success).toBe(false);
        expect(r.Errors[0].Message).toContain('non-negative');
    });
    it('rejects invalid JSON and non-object JSON', () => {
        expect(check('not-valid-json').Errors[0].Message).toContain('Invalid Configuration JSON');
        expect(check('[1]').Success).toBe(false);
    });
    it('rejects non-string option fields', () => {
        expect(ValidateReminderConfiguration(JSON.stringify({ From: 5 }))[0].Field).toBe('From');
    });
});

describe('FormatNotification', () => {
    it('reminder: counts and priority', () => {
        const job = new ReminderSenderJob();
        const ok = job.FormatNotification(CONTEXT, { Success: true, Details: { SentCount: 150 } });
        expect(ok.Subject).toContain('150');
        expect(ok.Priority).toBe('Normal');
        const bad = job.FormatNotification(CONTEXT, { Success: false, ErrorMessage: 'boom' });
        expect(bad.Subject).toContain('0');
        expect(bad.Priority).toBe('High');
        expect(bad.Body).toContain('boom');
    });
    it('scheduler and snapshot jobs always supply a Priority', () => {
        const s = new ElectionSchedulerJob().FormatNotification(CONTEXT, { Success: true, Details: { OpenedCount: 2, ClosedCount: 1 } });
        expect(s.Subject).toContain('2 opened');
        expect(s.Priority).toBeDefined();
        const p = new ResultSnapshotPublisherJob().FormatNotification(CONTEXT, { Success: true });
        expect(p.Priority).toBeDefined();
    });
    it('non-reminder jobs validate any configuration', () => {
        expect(new ElectionSchedulerJob().ValidateConfiguration(scheduleWith('x')).Success).toBe(true);
        expect(new ResultSnapshotPublisherJob().ValidateConfiguration(scheduleWith(null)).Success).toBe(true);
    });
});

describe('open / close selection', () => {
    it('opens Ready elections whose OpensAt has arrived', () => {
        const rows = [
            election({ ID: 'due', Status: 'Ready', OpensAt: at(-1000), ClosesAt: at(DAY) }),
            election({ ID: 'future', Status: 'Ready', OpensAt: at(1000) }),
            election({ ID: 'noopen', Status: 'Ready', OpensAt: null }),
            election({ ID: 'draft', Status: 'Draft', OpensAt: at(-1000) }),
            election({ ID: 'already-expired', Status: 'Ready', OpensAt: at(-2 * DAY), ClosesAt: at(-DAY) }),
            election({ ID: 'iso', Status: 'Ready', OpensAt: at(-5000).toISOString() }),
        ];
        expect(SelectElectionsToOpen(rows, NOW).map((e) => e.ID)).toEqual(['due', 'iso']);
    });
    it('closes Open elections whose ClosesAt has passed (inclusive)', () => {
        const rows = [
            election({ ID: 'past', ClosesAt: at(-1) }),
            election({ ID: 'exact', ClosesAt: at(0) }),
            election({ ID: 'later', ClosesAt: at(1) }),
            election({ ID: 'none', ClosesAt: null }),
            election({ ID: 'closed', Status: 'Closed', ClosesAt: at(-DAY) }),
        ];
        expect(SelectElectionsToClose(rows, NOW).map((e) => e.ID)).toEqual(['past', 'exact']);
    });
});

describe('snapshot selection', () => {
    it('selects Open, running-results, Standard-tier, not-yet-closed elections', () => {
        const rows = [
            election({ ID: 'live', ResultsTiming: 'Live', ClosesAt: at(DAY) }),
            election({ ID: 'admin', ResultsTiming: 'AdministratorsOnly' }),
            election({ ID: 'afterclose', ResultsTiming: 'AfterClose' }),
            election({ ID: 'tierB', ResultsTiming: 'Live', AssuranceTier: 'HighAssurance' }),
            election({ ID: 'expired', ResultsTiming: 'Live', ClosesAt: at(-1) }),
            election({ ID: 'ready', Status: 'Ready', ResultsTiming: 'Live' }),
        ];
        expect(SelectElectionsForSnapshot(rows, NOW).map((e) => e.ID)).toEqual(['live', 'admin']);
    });
});

describe('reminder selection', () => {
    it('normalizes days: filters bad values, dedupes, sorts descending', () => {
        expect(NormalizeReminderDays([1, 7, 3, 3, -1, 'x', NaN])).toEqual([7, 3, 1]);
        expect(NormalizeReminderDays('7')).toEqual([]);
    });
    it('reads election-level days from Configuration JSON', () => {
        expect(ParseElectionReminderDays(JSON.stringify({ Reminders: { DaysBeforeClose: [1, 3] } }))).toEqual([3, 1]);
        expect(ParseElectionReminderDays('bad')).toEqual([]);
        expect(ParseElectionReminderDays(null)).toEqual([]);
    });
    it('is not due before any threshold is crossed', () => {
        expect(DueReminderThreshold(at(10 * DAY), [7, 3, 1], null, NOW)).toBeNull();
    });
    it('is due once a threshold is crossed and nothing was sent', () => {
        const t = DueReminderThreshold(at(6 * DAY), [7, 3, 1], null, NOW);
        expect(t?.getTime()).toBe(at(6 * DAY).getTime() - 7 * DAY);
    });
    it('sends one reminder per threshold', () => {
        const closes = at(2.5 * DAY); // the 3-day threshold was crossed 0.5 days ago
        const crossedAt = new Date(closes.getTime() - 3 * DAY);
        expect(DueReminderThreshold(closes, [7, 3, 1], at(-3 * DAY), NOW)).not.toBeNull(); // last sent before 3-day mark
        expect(DueReminderThreshold(closes, [7, 3, 1], new Date(crossedAt.getTime() + 1000), NOW)).toBeNull(); // already sent for it
    });
    it('catches up to the latest crossed threshold and ignores closed elections', () => {
        const closes = at(0.5 * DAY); // 7, 3 and 1 day thresholds all crossed
        const t = DueReminderThreshold(closes, [7, 3, 1], null, NOW);
        expect(t?.getTime()).toBe(closes.getTime() - 1 * DAY);
        expect(DueReminderThreshold(at(-1), [7, 3, 1], null, NOW)).toBeNull();
    });
    it('uses election days over job defaults and respects the last-sent map', () => {
        const rows = [
            election({ ID: 'A', ClosesAt: at(2 * DAY) }),
            election({ ID: 'B', ClosesAt: at(2 * DAY), Configuration: JSON.stringify({ Reminders: { DaysBeforeClose: [10] } }) }),
            election({ ID: 'C', ClosesAt: at(2 * DAY) }),
            election({ ID: 'D', ClosesAt: at(20 * DAY) }),
            election({ ID: 'E', Status: 'Closed', ClosesAt: at(2 * DAY) }),
        ];
        const last = new Map<string, Date>([['c', at(-1000)]]);
        const picked = SelectElectionsForReminder(rows, last, [3], NOW).map((e) => e.ID);
        expect(picked).toEqual(['A', 'B']);
    });
});
