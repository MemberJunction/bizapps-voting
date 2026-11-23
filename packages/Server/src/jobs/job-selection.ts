/**
 * Pure selection logic for the scheduled jobs: given election rows and a clock, which elections should be opened,
 * closed, snapshotted or reminded. No I/O, so every rule is unit tested without a database.
 */

/** The election columns the jobs read. Dates may arrive as Date or ISO string depending on the provider. */
export interface JobElectionRow {
    ID: string;
    Name: string;
    Status: string;
    OpensAt: Date | string | null;
    ClosesAt: Date | string | null;
    ResultsTiming: string;
    AssuranceTier: string;
    Configuration: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** A date value as a Date, or null when absent or unparseable. */
export function ToDate(value: Date | string | null | undefined): Date | null {
    if (value === null || value === undefined) return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** Ready elections whose opening time has arrived and whose closing time has not already passed. */
export function SelectElectionsToOpen(elections: readonly JobElectionRow[], now: Date): JobElectionRow[] {
    return elections.filter((e) => {
        if (e.Status !== 'Ready') return false;
        const opens = ToDate(e.OpensAt);
        if (!opens || opens.getTime() > now.getTime()) return false;
        const closes = ToDate(e.ClosesAt);
        return !closes || closes.getTime() > now.getTime();
    });
}

/** Open elections whose closing time has passed. */
export function SelectElectionsToClose(elections: readonly JobElectionRow[], now: Date): JobElectionRow[] {
    return elections.filter((e) => {
        if (e.Status !== 'Open') return false;
        const closes = ToDate(e.ClosesAt);
        return !!closes && closes.getTime() <= now.getTime();
    });
}

/**
 * Open elections that show running results (anything but AfterClose) and can have snapshots: only the Standard tier
 * publishes running results. The batch policy (how many new ballots, how many minutes) is the ResultsEngine's call.
 */
export function SelectElectionsForSnapshot(elections: readonly JobElectionRow[], now: Date): JobElectionRow[] {
    return elections.filter((e) => {
        if (e.Status !== 'Open' || e.ResultsTiming === 'AfterClose' || e.AssuranceTier !== 'Standard') return false;
        const closes = ToDate(e.ClosesAt);
        return !closes || closes.getTime() > now.getTime();
    });
}

/** Reads `Reminders.DaysBeforeClose` from an election's Configuration JSON; empty when absent or invalid. */
export function ParseElectionReminderDays(configuration: string | null): number[] {
    if (!configuration) return [];
    try {
        const parsed: unknown = JSON.parse(configuration);
        if (parsed === null || typeof parsed !== 'object') return [];
        const reminders = (parsed as { Reminders?: { DaysBeforeClose?: unknown } }).Reminders;
        return NormalizeReminderDays(reminders?.DaysBeforeClose);
    } catch {
        return [];
    }
}

/** Keeps finite non-negative numbers, de-duplicated and sorted descending (earliest reminder first). */
export function NormalizeReminderDays(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    const days = value.filter((d): d is number => typeof d === 'number' && Number.isFinite(d) && d >= 0);
    return [...new Set(days)].sort((a, b) => b - a);
}

/**
 * The reminder threshold that is due for an election, or null.
 *
 * Each `d` in `daysBeforeClose` is a threshold instant `ClosesAt - d days`. The most recent threshold already crossed is
 * due when no reminder has been sent since it was crossed - so each threshold yields at most one reminder, a skipped
 * run catches up on the next tick, and thresholds crossed together send a single reminder.
 */
export function DueReminderThreshold(closesAt: Date | null, daysBeforeClose: readonly number[], lastSentAt: Date | null, now: Date): Date | null {
    if (!closesAt || closesAt.getTime() <= now.getTime()) return null;
    let latestCrossed: Date | null = null;
    for (const d of daysBeforeClose) {
        const threshold = new Date(closesAt.getTime() - d * DAY_MS);
        if (threshold.getTime() <= now.getTime() && (!latestCrossed || threshold.getTime() > latestCrossed.getTime())) {
            latestCrossed = threshold;
        }
    }
    if (!latestCrossed) return null;
    return lastSentAt && lastSentAt.getTime() >= latestCrossed.getTime() ? null : latestCrossed;
}

/**
 * Open elections due a reminder now. `defaultDays` (from the job's Configuration) applies to elections that do not
 * set their own `Reminders.DaysBeforeClose`.
 */
export function SelectElectionsForReminder(
    elections: readonly JobElectionRow[],
    lastReminderByElectionID: ReadonlyMap<string, Date>,
    defaultDays: readonly number[],
    now: Date
): JobElectionRow[] {
    return elections.filter((e) => {
        if (e.Status !== 'Open') return false;
        const own = ParseElectionReminderDays(e.Configuration);
        const days = own.length > 0 ? own : defaultDays;
        const last = lastReminderByElectionID.get(e.ID.toLowerCase()) ?? null;
        return DueReminderThreshold(ToDate(e.ClosesAt), days, last, now) !== null;
    });
}
