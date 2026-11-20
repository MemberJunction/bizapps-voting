/**
 * Pure policy and shaping helpers for results, snapshots, turnout and the certification disclosure (design section 4.5).
 * No MJ runtime imports: unit-testable without a database.
 */

import {
    type AssuranceTier,
    type IElectionConfiguration,
    type ResultsAudience,
    type ResultsTiming,
    type SecrecyMode,
    SuppressSmallClasses,
} from '@mj-biz-apps/voting-entities/contracts';
import type { VotingContestOutcome, VotingTallyOptionResult } from '@mj-biz-apps/voting-entities';
import { EvaluateQuorum } from './tally-pipeline.js';

// --- Snapshot batching ------------------------------------------------------------------------------------

/** Used when an election leaves LiveRefreshEveryBallots / LiveRefreshMinMinutes null: never per ballot. */
export const DEFAULT_LIVE_REFRESH_EVERY_BALLOTS = 5;
export const DEFAULT_LIVE_REFRESH_MIN_MINUTES = 5;

export interface SnapshotDecisionInput {
    /** Ballots in the poll book now. */
    BallotCount: number;
    MinCast: number;
    Last: { BallotCount: number; SnapshotAt: Date } | null;
    EveryBallots: number | null;
    MinMinutes: number | null;
    Now: Date;
}

export interface SnapshotDecision {
    Publish: boolean;
    Reason: string;
}

/**
 * Whether a new snapshot is due. The first snapshot is published as soon as MinCast ballots are in; after that, only when
 * at least N new ballots AND at least T minutes since the last one (so totals never move per ballot).
 */
export function ShouldPublishSnapshot(input: SnapshotDecisionInput): SnapshotDecision {
    if (input.BallotCount < input.MinCast) {
        return { Publish: false, Reason: `Fewer than ${input.MinCast} ballots are cast; nothing is published yet.` };
    }
    if (!input.Last) return { Publish: true, Reason: 'First snapshot.' };
    const everyBallots = Math.max(1, input.EveryBallots ?? DEFAULT_LIVE_REFRESH_EVERY_BALLOTS);
    const minMinutes = Math.max(0, input.MinMinutes ?? DEFAULT_LIVE_REFRESH_MIN_MINUTES);
    const newBallots = input.BallotCount - input.Last.BallotCount;
    if (newBallots < everyBallots) {
        return { Publish: false, Reason: `Only ${Math.max(0, newBallots)} new ballots since the last snapshot; ${everyBallots} are needed.` };
    }
    const minutesSince = (input.Now.getTime() - input.Last.SnapshotAt.getTime()) / 60000;
    if (minutesSince < minMinutes) {
        return { Publish: false, Reason: `The last snapshot is ${minutesSince.toFixed(1)} minutes old; ${minMinutes} are needed.` };
    }
    return { Publish: true, Reason: 'Batch policy satisfied.' };
}

// --- Weight-class suppression -------------------------------------------------------------------------------

export interface ClassCount {
    WeightClass: string;
    Count: number;
}

export interface ClassSuppression {
    /** False when a class too small to report would be mixed into the totals. */
    Allowed: boolean;
    SuppressedClasses: string[];
}

/** Counts ballots per weight class (null class counts as '1'). */
export function CountByWeightClass(weightClasses: ReadonlyArray<string | null>): ClassCount[] {
    const counts = new Map<string, number>();
    for (const wc of weightClasses) {
        const key = wc ?? '1';
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts, ([WeightClass, Count]) => ({ WeightClass, Count })).sort((a, b) => a.WeightClass.localeCompare(b.WeightClass));
}

/**
 * k-anonymity by weight class (design section 4.2). Weighted totals that mix in a class with fewer than k ballots could
 * identify that class's voters, so the totals are withheld. With a single class the whole electorate is the class and
 * ResultsMinCast is the guard, so it is allowed.
 */
export function EvaluateClassSuppression(classCounts: readonly ClassCount[], k: number): ClassSuppression {
    const { SuppressedClasses } = SuppressSmallClasses(classCounts.map((c) => ({ ...c })), k);
    if (classCounts.length <= 1) return { Allowed: true, SuppressedClasses: [] };
    return { Allowed: SuppressedClasses.length === 0, SuppressedClasses };
}

// --- Snapshot payload ------------------------------------------------------------------------------------------

export interface SnapshotContest {
    ContestID: string;
    /** True for ranked contests: counts are first preferences only. */
    IsFirstPreferencesOnly: boolean;
    VotesCast: number;
    Abstentions: number;
    Options: Array<{ OptionID: string; Votes: number }>;
}

export interface SnapshotPayload {
    Version: 1;
    Contests: SnapshotContest[];
    ClassCounts: ClassCount[];
}

export interface RunningTallyRow {
    ContestID: string;
    ContestOptionID: string | null;
    VoteCount: number;
}

export interface SnapshotContestPlan {
    ContestID: string;
    IsRanked: boolean;
    OptionIDs: string[];
}

/** Assembles the snapshot payload from the running-tally rows. A null option row holds the abstentions. */
export function BuildSnapshotPayload(plans: readonly SnapshotContestPlan[], rows: readonly RunningTallyRow[], classCounts: readonly ClassCount[]): SnapshotPayload {
    const contests = plans.map<SnapshotContest>((plan) => {
        const mine = rows.filter((r) => r.ContestID.toLowerCase() === plan.ContestID.toLowerCase());
        const options = plan.OptionIDs.map((optionID) => ({
            OptionID: optionID,
            Votes: mine.filter((r) => r.ContestOptionID !== null && r.ContestOptionID.toLowerCase() === optionID.toLowerCase()).reduce((s, r) => s + Number(r.VoteCount), 0),
        }));
        const abstentions = mine.filter((r) => r.ContestOptionID === null).reduce((s, r) => s + Number(r.VoteCount), 0);
        return {
            ContestID: plan.ContestID,
            IsFirstPreferencesOnly: plan.IsRanked,
            VotesCast: options.reduce((s, o) => s + o.Votes, 0),
            Abstentions: abstentions,
            Options: options,
        };
    });
    return { Version: 1, Contests: contests, ClassCounts: classCounts.map((c) => ({ ...c })) };
}

/** Parses a stored snapshot. Null when it is not a payload this version understands. */
export function ParseSnapshotPayload(json: string): SnapshotPayload | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        return null;
    }
    if (parsed === null || typeof parsed !== 'object') return null;
    const p = parsed as Partial<SnapshotPayload>;
    if (p.Version !== 1 || !Array.isArray(p.Contests) || !Array.isArray(p.ClassCounts)) return null;
    return p as SnapshotPayload;
}

/** Ranks options by votes (competition ranking: equal votes share a position). */
function RankOptions(options: ReadonlyArray<{ OptionID: string; Votes: number }>): VotingTallyOptionResult[] {
    const sorted = options.slice().sort((a, b) => b.Votes - a.Votes);
    let position = 0;
    let previous: number | null = null;
    return sorted.map((o, i) => {
        if (previous === null || o.Votes !== previous) {
            position = i + 1;
            previous = o.Votes;
        }
        return { OptionID: o.OptionID, Votes: o.Votes, Position: position, Outcome: 'Counted' as const };
    });
}

/**
 * Running results shaped as the operation output. A running view has no outcome yet, so every contest reports 'Void' with
 * an explanatory note and the output's IsRunning flag is set by the caller.
 */
export function SnapshotToContestOutcomes(payload: SnapshotPayload): VotingContestOutcome[] {
    return payload.Contests.map((c) => {
        const notes = ['Running results; the count is not final.'];
        if (c.IsFirstPreferencesOnly) notes.push('First preferences only; the full ranked count runs at close.');
        return {
            ContestID: c.ContestID,
            Outcome: 'Running' as const,
            VotesCast: c.VotesCast,
            Abstentions: c.Abstentions,
            Options: RankOptions(c.Options),
            Notes: notes,
        };
    });
}

// --- Turnout -----------------------------------------------------------------------------------------------------

export interface TurnoutRow {
    Channel: string;
    VoterCredentialMethodID: string | null;
}

export interface TurnoutSummary {
    Eligible: number;
    Voted: number;
    TurnoutPercent: number;
    QuorumMet?: boolean;
    ByChannel: Record<string, number>;
    ByMethod: Record<string, number>;
}

/** Turnout from poll-book rows only. Never reads or derives anything about how people voted. */
export function ComputeTurnout(
    eligibleCount: number,
    rows: readonly TurnoutRow[],
    methodCodeOf: (methodID: string) => string | null,
    quorum: IElectionConfiguration['Quorum'] | undefined
): TurnoutSummary {
    const byChannel: Record<string, number> = {};
    const byMethod: Record<string, number> = {};
    for (const r of rows) {
        byChannel[r.Channel] = (byChannel[r.Channel] ?? 0) + 1;
        const method = r.VoterCredentialMethodID ? (methodCodeOf(r.VoterCredentialMethodID) ?? 'unknown') : 'none';
        byMethod[method] = (byMethod[method] ?? 0) + 1;
    }
    const voted = rows.length;
    const pct = eligibleCount > 0 ? Math.round((voted / eligibleCount) * 10000) / 100 : 0;
    const summary: TurnoutSummary = { Eligible: eligibleCount, Voted: voted, TurnoutPercent: pct, ByChannel: byChannel, ByMethod: byMethod };
    const q = EvaluateQuorum(quorum, voted, eligibleCount);
    if (q.Required) summary.QuorumMet = q.Met;
    return summary;
}

// --- Certification disclosure --------------------------------------------------------------------------------------

export interface DisclosureInput {
    Timing: ResultsTiming;
    Audience: ResultsAudience;
    MinCast: number;
    SecrecyMode: SecrecyMode;
    AssuranceTier: AssuranceTier;
    SnapshotCount: number;
}

const TIMING_TEXT: Record<ResultsTiming, string> = {
    AfterClose: 'Results were not visible to anyone while voting was open; only turnout was reported.',
    AfterVoting: 'Running results were shown to each voter after they cast their ballot.',
    Live: 'Running results were visible to the results audience throughout voting.',
    AdministratorsOnly: 'Running results were visible to administrators only while voting was open, and every view was audited.',
};

/** The results-timing statement the certification report carries (design section 4.5, "Disclosure"). */
export function DescribeResultsTimingDisclosure(input: DisclosureInput): string {
    const parts: string[] = [`Results timing: ${input.Timing}. ${TIMING_TEXT[input.Timing]}`];
    parts.push(`Results audience: ${input.Audience}.`);
    if (input.Timing !== 'AfterClose') {
        parts.push(
            `Running results were published in batched snapshots (${input.SnapshotCount} published), withheld until at least ${input.MinCast} ballots were cast, ` +
                'and ranked contests showed first preferences only.'
        );
    }
    parts.push(`Secrecy mode: ${input.SecrecyMode}. Assurance tier: ${input.AssuranceTier}.`);
    return parts.join(' ');
}

/** Required certifier count from the resolved configuration: a positive whole number, default 1. */
export function RequiredCertifiersOf(configuration: object): number {
    const raw = (configuration as Record<string, unknown>).RequiredCertifiers;
    return typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 ? raw : 1;
}
