import { BaseTallyMethodContract } from '../types.js';
import type { TallyContestInput, TallyOptionResult, TallyOutcome, TallyRound } from '../types.js';

/** Fixed-point scale: all counting is done in integer units of 0.00001 votes (5 decimal places). */
const SCALE = 100000;

/** Deterministic lot: FNV-1a hash of the seed string feeding a mulberry32 generator. Private on purpose. */
class StvLot {
    private state: number;

    constructor(seed: string) {
        let h = 0x811c9dc5;
        for (let i = 0; i < seed.length; i++) {
            h ^= seed.charCodeAt(i);
            h = Math.imul(h, 0x01000193) >>> 0;
        }
        this.state = h >>> 0;
    }

    private Next(): number {
        this.state = (this.state + 0x6d2b79f5) >>> 0;
        let t = this.state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /** Uniform index in [0, n). */
    public PickIndex(n: number): number {
        return Math.floor(this.Next() * n);
    }
}

interface StvBallot {
    /** Candidate indexes in preference order. */
    Prefs: number[];
    /** Index into Prefs of the preference currently holding the ballot. */
    Pos: number;
    /** Candidate currently holding the ballot, or -1 when exhausted. */
    Holder: number;
    /** Current transfer value, in units of 1/SCALE votes. */
    Value: number;
}

type CandidateStatus = 'continuing' | 'elected' | 'excluded';

/** What one count produces. */
interface StvCountResult {
    ElectedOrder: number[];
    ExcludedOrder: number[];
    LastTally: number[];
    Rounds: TallyRound[];
    /** One note per lot drawn, in order. */
    LotNotes: string[];
    LotsDrawn: number;
}

/** How many alternative counts `ElectionDependsOnLots` may run before it conservatively reports the lot as decisive. */
const STV_LOT_PATH_LIMIT = 256;

/**
 * Multi-seat Single Transferable Vote, counted by the Scottish STV rules: the Weighted Inclusive Gregory
 * Method (WIGM) of the Scottish Local Government Elections Order 2007 (SSI 2007/42), with Droop quota.
 * Bylaws must name the counting rule because STV variants (Meek, Cambridge, Scottish, ...) can give
 * different results; this class implements exactly the following.
 *
 * Ballots and quota
 * - A valid ballot has at least one ranked selection that names a known option and is not an abstention.
 *   Its weight is the voter's class representative weight. Abstentions and ballots with no usable
 *   preference are counted in `Abstentions`, never in `VotesCast`.
 * - Preferences are ordered by `Rank` ascending (selections without a rank keep submission order after the
 *   ranked ones); a repeated option keeps only its first occurrence. Equal ranks keep submission order.
 * - Quota (Droop) on the weighted valid total T with S seats: when every weight is an integer,
 *   floor(T / (S + 1)) + 1. When any weight is fractional, T / (S + 1) truncated to 5 decimal places, plus
 *   0.00001. All arithmetic is exact fixed-point (integer units of 0.00001), so there is no float drift.
 *
 * Counting (one stage per round)
 * - Every ballot has a transfer value, initially its weight. A candidate's count is the sum of the values
 *   of the ballots currently held by that candidate.
 * - Each stage: continuing candidates whose count reaches the quota are elected, largest count first
 *   (ties: more votes at the most recent earlier stage where they differed, otherwise by lot).
 * - If all seats are filled the count ends. If the continuing candidates no longer outnumber the seats
 *   still open, all of them are elected (noted) and the count ends.
 * - Otherwise, if an elected candidate holds a surplus (count above quota), the LARGEST surplus is
 *   transferred (one surplus per stage; ties as above). Inclusive Gregory: ALL of the candidate's ballots
 *   transfer, each to its next preference for a continuing candidate, at the new value
 *   floor(value * surplus / candidate count) truncated to 5 decimals. Value that has no continuing next
 *   preference is recorded as exhausted. The remainder lost to truncation is not tracked as a vote.
 * - Otherwise the continuing candidate with the FEWEST votes is excluded (ties: fewer votes at the most
 *   recent earlier stage where they differed, otherwise by lot) and all of their ballots transfer to next
 *   continuing preferences at their current values.
 * - An elected candidate whose ballots have been transferred (or who had no surplus) is shown at the quota.
 *
 * Output
 * - `Outcome` is 'Decided', or 'Void' when there are no valid ballots or fewer than one seat.
 * - Options are listed elected first in order of election (Outcome 'Elected'), then non-excluded losers by
 *   final count ('Defeated'), then excluded candidates, last excluded first ('Excluded'). `Position` follows
 *   that order. `Votes` is the candidate's last recorded count (quota for candidates whose surplus was
 *   transferred).
 * - Every tie resolved by lot adds a note. `TieBroken` is set only when a lot DECIDED the outcome: the set of elected
 *   candidates would differ under some other fall of the lots (every combination is recounted, up to
 *   STV_LOT_PATH_LIMIT counts, beyond which the flag is set conservatively). A lot that only sequences candidates who are
 *   all elected, or excludes one of several candidates without changing who wins, adds its note but not the flag
 *   (the same narrowing as `RankWithTies` for single-stage methods). The lot is a deterministic function of
 *   `TieBreakSeed` (FNV-1a hash into mulberry32), so the same input always yields the same result.
 * - With a single seat the result equals instant-runoff voting.
 */
export class StvTallyMethod extends BaseTallyMethodContract {
    public readonly Code = 'stv';

    public Tally(input: TallyContestInput): TallyOutcome {
        const candidates = input.OptionIDs;
        const indexOf = new Map<string, number>();
        candidates.forEach((id, i) => indexOf.set(id, i));

        const ballots: StvBallot[] = [];
        let abstentionUnits = 0;
        let allIntegerWeights = true;
        for (const b of input.Ballots) {
            const prefs = b.Abstain ? [] : this.RankedPreferences(b.Selections, indexOf);
            const units = Math.round(b.Weight * SCALE);
            if (prefs.length === 0) {
                abstentionUnits += units;
                continue;
            }
            if (units % SCALE !== 0) allIntegerWeights = false;
            ballots.push({ Prefs: prefs, Pos: 0, Holder: prefs[0], Value: units });
        }

        const totalUnits = ballots.reduce((s, b) => s + b.Value, 0);
        const notes: string[] = [];
        const seats = input.Seats;
        const base: TallyOutcome = {
            Outcome: 'Void',
            VotesCast: totalUnits / SCALE,
            Abstentions: abstentionUnits / SCALE,
            Options: candidates.map((id, i) => ({ OptionID: id, Votes: 0, Position: i + 1, Outcome: 'Defeated' as const })),
            Rounds: [],
            TieBroken: false,
            Notes: notes
        };
        if (seats < 1) {
            notes.push('No seats to fill.');
            return base;
        }
        if (ballots.length === 0) {
            notes.push('No valid ballots.');
            return base;
        }

        const quota = allIntegerWeights
            ? (Math.floor(totalUnits / (SCALE * (seats + 1))) + 1) * SCALE
            : Math.floor(totalUnits / (seats + 1)) + 1;
        notes.push(`Scottish STV (Weighted Inclusive Gregory Method), Droop quota ${quota / SCALE} on ${totalUnits / SCALE} valid votes for ${seats} seat(s).`);

        const lot = new StvLot(input.TieBreakSeed);
        const count = this.Count(candidates, ballots, quota, seats, (tied) => tied[lot.PickIndex(tied.length)]);
        notes.push(...count.LotNotes);
        const tieBroken = count.LotsDrawn > 0 && this.ElectionDependsOnLots(candidates, ballots, quota, seats, count.ElectedOrder);
        if (count.LotsDrawn > 0 && !tieBroken) notes.push('Ties were broken by lot, but no lot changed which candidates were elected.');

        const { ElectedOrder: electedOrder, ExcludedOrder: excludedOrder, LastTally: lastTally } = count;
        const electedSet = new Set(electedOrder);
        const excludedSet = new Set(excludedOrder);
        const defeated = candidates
            .map((_, i) => i)
            .filter(i => !electedSet.has(i) && !excludedSet.has(i))
            .sort((a, b) => lastTally[b] - lastTally[a] || a - b);
        const finalOrder: Array<{ Index: number; Outcome: TallyOptionResult['Outcome'] }> = [
            ...electedOrder.map(i => ({ Index: i, Outcome: 'Elected' as const })),
            ...defeated.map(i => ({ Index: i, Outcome: 'Defeated' as const })),
            ...[...excludedOrder].reverse().map(i => ({ Index: i, Outcome: 'Excluded' as const }))
        ];
        return {
            Outcome: 'Decided',
            VotesCast: totalUnits / SCALE,
            Abstentions: abstentionUnits / SCALE,
            Options: finalOrder.map((f, p) => ({
                OptionID: candidates[f.Index],
                Votes: lastTally[f.Index] / SCALE,
                Position: p + 1,
                Outcome: f.Outcome
            })),
            Rounds: count.Rounds,
            TieBroken: tieBroken,
            Notes: notes
        };
    }

    /**
     * Whether the SET of elected candidates depends on how any lot fell: every combination of lot outcomes is counted
     * (depth first, each lot's alternatives in turn) and compared with `elected`. A lot that only sequences candidates who
     * are all elected (or all lose), or excludes one of several candidates without changing who wins, is not decisive.
     * Bounded by STV_LOT_PATH_LIMIT counts; beyond it the answer is conservatively true.
     */
    private ElectionDependsOnLots(candidates: readonly string[], ballots: readonly StvBallot[], quota: number, seats: number, elected: readonly number[]): boolean {
        const target = [...elected].sort((a, b) => a - b).join(',');
        const pending: number[][] = [[]];
        let counts = 0;
        while (pending.length > 0) {
            const prefix = pending.pop() as number[];
            if (++counts > STV_LOT_PATH_LIMIT) return true;
            const branching: number[] = [];
            const result = this.Count(candidates, ballots, quota, seats, (tied) => {
                const pick = branching.length < prefix.length ? prefix[branching.length] : 0;
                branching.push(tied.length);
                return tied[pick];
            });
            if ([...result.ElectedOrder].sort((a, b) => a - b).join(',') !== target) return true;
            for (let j = prefix.length; j < branching.length; j++) {
                for (let alt = 1; alt < branching[j]; alt++) {
                    pending.push([...prefix, ...new Array<number>(j - prefix.length).fill(0), alt]);
                }
            }
        }
        return false;
    }

    /**
     * One full count (the stages described on the class). `chooseByLot` resolves a tie that earlier-stage totals could not;
     * the ballots are copied, so the same prepared ballots can be counted again.
     */
    private Count(
        candidates: readonly string[],
        prepared: readonly StvBallot[],
        quota: number,
        seats: number,
        chooseByLot: (tied: number[]) => number
    ): StvCountResult {
        const ballots: StvBallot[] = prepared.map(b => ({ ...b }));
        const status: CandidateStatus[] = candidates.map(() => 'continuing');
        const settled: boolean[] = candidates.map(() => false);
        const lastTally: number[] = candidates.map(() => 0);
        const electedOrder: number[] = [];
        const excludedOrder: number[] = [];
        const history: number[][] = [];
        const rounds: TallyRound[] = [];
        const lotNotes: string[] = [];
        let lotsDrawn = 0;

        /** Pick the largest (or smallest) of `group`, resolving ties backwards through earlier stages, then by lot. */
        const pickExtreme = (group: number[], totals: number[], largest: boolean, what: string): number => {
            let tied = this.Extremes(group, totals, largest);
            for (let h = history.length - 2; h >= 0 && tied.length > 1; h--) {
                tied = this.Extremes(tied, history[h], largest);
            }
            if (tied.length === 1) return tied[0];
            const chosen = chooseByLot(tied);
            lotsDrawn++;
            lotNotes.push(`Tie by lot (${what}) among ${tied.map(i => candidates[i]).join(', ')}; chose ${candidates[chosen]}.`);
            return chosen;
        };
        const orderByTotal = (group: number[], totals: number[], what: string): number[] => {
            const rest = [...group];
            const ordered: number[] = [];
            while (rest.length > 0) {
                const next = pickExtreme(rest, totals, true, what);
                ordered.push(next);
                rest.splice(rest.indexOf(next), 1);
            }
            return ordered;
        };

        for (let round = 1; round <= candidates.length * 2 + 2; round++) {
            const totals = candidates.map(() => 0);
            for (const b of ballots) if (b.Holder >= 0 && !settled[b.Holder]) totals[b.Holder] += b.Value;
            candidates.forEach((_, i) => {
                if (settled[i]) totals[i] = quota;
                if (status[i] === 'excluded') totals[i] = 0;
            });
            history.push(totals);

            const roundElected: number[] = [];
            const roundExcluded: number[] = [];
            const transfers: Record<string, number> = {};
            let exhausted = 0;
            const noteParts: string[] = [];
            let finished = false;

            const continuing = () => candidates.map((_, i) => i).filter(i => status[i] === 'continuing');
            const open = () => seats - electedOrder.length;

            // 1. Elect everyone at or above the quota, largest first.
            const reached = continuing().filter(i => totals[i] >= quota);
            const reachedOrder = orderByTotal(reached, totals, 'order of election');
            for (const i of reachedOrder) {
                if (open() <= 0) break;
                status[i] = 'elected';
                electedOrder.push(i);
                roundElected.push(i);
                noteParts.push(`${candidates[i]} elected with ${totals[i] / SCALE} (quota ${quota / SCALE}).`);
            }

            if (open() <= 0) {
                finished = true;
            } else if (continuing().length <= open()) {
                // 2. Remaining candidates fill the remaining seats.
                const rest = orderByTotal(continuing(), totals, 'order of election');
                for (const i of rest) {
                    status[i] = 'elected';
                    electedOrder.push(i);
                    roundElected.push(i);
                }
                noteParts.push(`${rest.map(i => candidates[i]).join(', ')} elected without reaching quota: continuing candidates equal the seats remaining.`);
                finished = true;
            } else {
                // Elected candidates with no surplus need no transfer.
                for (const i of electedOrder) if (!settled[i] && totals[i] <= quota) settled[i] = true;
                const withSurplus = electedOrder.filter(i => !settled[i]);
                if (withSurplus.length > 0) {
                    // 3. Transfer the largest surplus.
                    const surpluses = candidates.map((_, i) => (withSurplus.includes(i) ? totals[i] - quota : -1));
                    const source = pickExtreme(withSurplus, surpluses, true, 'largest surplus');
                    const surplus = totals[source] - quota;
                    const sourceTotal = totals[source];
                    for (const b of ballots) {
                        if (b.Holder !== source) continue;
                        b.Value = Number((BigInt(b.Value) * BigInt(surplus)) / BigInt(sourceTotal));
                        this.MoveToNext(b, status);
                        if (b.Holder < 0) exhausted += b.Value;
                        else transfers[candidates[b.Holder]] = (transfers[candidates[b.Holder]] ?? 0) + b.Value;
                    }
                    settled[source] = true;
                    noteParts.push(`Surplus of ${surplus / SCALE} from ${candidates[source]} transferred at value ${surplus / SCALE}/${sourceTotal / SCALE}.`);
                } else {
                    // 4. Exclude the lowest continuing candidate.
                    const lowest = pickExtreme(continuing(), totals, false, 'exclusion');
                    status[lowest] = 'excluded';
                    excludedOrder.push(lowest);
                    roundExcluded.push(lowest);
                    for (const b of ballots) {
                        if (b.Holder !== lowest) continue;
                        this.MoveToNext(b, status);
                        if (b.Holder < 0) exhausted += b.Value;
                        else transfers[candidates[b.Holder]] = (transfers[candidates[b.Holder]] ?? 0) + b.Value;
                    }
                    noteParts.push(`${candidates[lowest]} excluded with ${totals[lowest] / SCALE}; ballots transferred.`);
                }
            }

            const tallies: Record<string, number> = {};
            candidates.forEach((id, i) => {
                tallies[id] = totals[i] / SCALE;
                if (status[i] !== 'excluded' || roundExcluded.includes(i)) lastTally[i] = totals[i];
            });
            const scaled = (v: Record<string, number>): Record<string, number> =>
                Object.fromEntries(Object.entries(v).map(([k, u]) => [k, u / SCALE]));
            rounds.push({
                Round: round,
                Tallies: tallies,
                Elected: roundElected.map(i => candidates[i]),
                Excluded: roundExcluded.map(i => candidates[i]),
                Transfers: scaled(transfers),
                Exhausted: exhausted / SCALE,
                Note: noteParts.join(' ')
            });
            if (finished) break;
        }

        return { ElectedOrder: electedOrder, ExcludedOrder: excludedOrder, LastTally: lastTally, Rounds: rounds, LotNotes: lotNotes, LotsDrawn: lotsDrawn };
    }

    /** Known, de-duplicated candidate indexes in preference order. */
    private RankedPreferences(selections: TallyContestInput['Ballots'][number]['Selections'], indexOf: Map<string, number>): number[] {
        const ordered = selections
            .map((s, order) => ({ Index: indexOf.get(s.OptionID), Rank: s.Rank ?? Number.POSITIVE_INFINITY, Order: order }))
            .filter((s): s is { Index: number; Rank: number; Order: number } => s.Index !== undefined)
            .sort((a, b) => (a.Rank === b.Rank ? a.Order - b.Order : a.Rank < b.Rank ? -1 : 1));
        const seen = new Set<number>();
        const prefs: number[] = [];
        for (const s of ordered) {
            if (seen.has(s.Index)) continue;
            seen.add(s.Index);
            prefs.push(s.Index);
        }
        return prefs;
    }

    /** Subset of `group` holding the largest (or smallest) value in `values`. */
    private Extremes(group: number[], values: number[], largest: boolean): number[] {
        const target = group.reduce((m, i) => (largest ? Math.max(m, values[i]) : Math.min(m, values[i])), largest ? -Infinity : Infinity);
        return group.filter(i => values[i] === target);
    }

    /** Move a ballot to its next continuing preference, or mark it exhausted (Holder = -1). */
    private MoveToNext(ballot: StvBallot, status: CandidateStatus[]): boolean {
        for (let p = ballot.Pos + 1; p < ballot.Prefs.length; p++) {
            if (status[ballot.Prefs[p]] === 'continuing') {
                ballot.Pos = p;
                ballot.Holder = ballot.Prefs[p];
                return true;
            }
        }
        ballot.Pos = ballot.Prefs.length;
        ballot.Holder = -1;
        return false;
    }
}
