/**
 * Pure helpers for the tally pipeline (design sections 4.4, 10, 14). No MJ runtime imports, so they unit-test without a
 * database: shuffling, weight classes, building the per-contest tally input from decrypted ballots and the roll, mapping a
 * tally outcome to result rows, quorum, and the certification ballot-set hash.
 */

import { randomBytes, randomInt } from 'node:crypto';
import {
    type BallotSubmission,
    type ContestKind,
    type ContestSubmission,
    type IElectionConfiguration,
    type OptionSelection,
    type TallyBallot,
    type TallyContestInput,
    type TallyOptionOutcome,
    type TallyOutcome,
    type ThresholdBasis,
    type ThresholdKind,
    ContestAppliesToVoter,
    RepresentativeWeights,
    Sha256Hex,
} from '@mj-biz-apps/voting-entities/contracts';

// --- Shuffle -----------------------------------------------------------------------------------

/** Uniform random integer in [0, max). Injectable so tests can pin the shuffle. */
export type RandomIntFn = (maxExclusive: number) => number;

/** Fisher-Yates with a CSPRNG. Returns a new array; the input is untouched. Runs BEFORE any ballot is decrypted. */
export function CryptoShuffle<T>(items: readonly T[], randomIntFn: RandomIntFn = (max) => randomInt(max)): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = randomIntFn(i + 1);
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

/** A fresh tie-break seed: 32 random hex characters. */
export function GenerateTieBreakSeed(): string {
    return randomBytes(16).toString('hex');
}

// --- Roll, weights, eligibility ------------------------------------------------------------------

/** The part of an EligibleVoter row the tally needs. */
export interface RollWeightRow {
    VotingClass: string | null;
    Weight: number;
}

/** Mean weight per weight class over the roll. Ballots never store a weight; the class maps back to this. */
export function ComputeClassWeights(roll: readonly RollWeightRow[]): Record<string, number> {
    return RepresentativeWeights(roll.map((r) => r.Weight));
}

/** Total weight of voters a contest applies to (the denominator when ThresholdBasis is Eligible). */
export function EligibleWeightForContest(roll: readonly RollWeightRow[], votingClassFilter: string | null): number {
    let total = 0;
    for (const r of roll) {
        if (ContestAppliesToVoter(votingClassFilter, r.VotingClass)) total += r.Weight;
    }
    return total;
}

/** Number of voters a contest applies to. */
export function EligibleCountForContest(roll: readonly RollWeightRow[], votingClassFilter: string | null): number {
    return roll.filter((r) => ContestAppliesToVoter(votingClassFilter, r.VotingClass)).length;
}

// --- Contest input ---------------------------------------------------------------------------------

/** What the engine knows about a contest, flattened from the election graph. */
export interface ContestPlan {
    ContestID: string;
    Kind: ContestKind;
    Seats: number;
    /** Active options in ballot order. Withdrawn options are not tallied. */
    OptionIDs: string[];
    Threshold: ThresholdKind;
    CustomThreshold: number | null;
    ThresholdBasis: ThresholdBasis;
    VotingClassFilter: string | null;
    TallyMethodCode: string;
    TieBreakMethod: 'Lot' | 'Administrator';
}

/** One decrypted counted ballot, ready to tally. */
export interface DecryptedBallot {
    WeightClass: string | null;
    VotingClass: string | null;
    Submission: BallotSubmission;
}

/** Parses decrypted selections JSON. Null when it is not a ballot submission. */
export function ParseSubmission(json: string): BallotSubmission | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        return null;
    }
    if (parsed === null || typeof parsed !== 'object') return null;
    const contests = (parsed as { Contests?: unknown }).Contests;
    if (!Array.isArray(contests)) return null;
    for (const c of contests) {
        if (c === null || typeof c !== 'object') return null;
        const cs = c as { ContestID?: unknown; Selections?: unknown };
        if (typeof cs.ContestID !== 'string' || !Array.isArray(cs.Selections)) return null;
    }
    return parsed as BallotSubmission;
}

/** The ballot's weight: the representative weight of its class (1 when the class is unknown, as on one-person-one-vote rolls). */
export function BallotWeight(weightClass: string | null, classWeights: Record<string, number>): number {
    if (weightClass === null) return 1;
    const w = classWeights[weightClass];
    return w !== undefined && Number.isFinite(w) && w > 0 ? w : 1;
}

/** Builds one contest's tally ballots from the decrypted ballot set. Selections of options outside the plan are dropped. */
export function BuildContestBallots(plan: ContestPlan, ballots: readonly DecryptedBallot[], classWeights: Record<string, number>): TallyBallot[] {
    const known = new Set(plan.OptionIDs.map((id) => id.toLowerCase()));
    const out: TallyBallot[] = [];
    for (const ballot of ballots) {
        if (!ContestAppliesToVoter(plan.VotingClassFilter, ballot.VotingClass)) continue;
        const sub = ballot.Submission.Contests.find((c) => c.ContestID.toLowerCase() === plan.ContestID.toLowerCase());
        if (!sub) continue;
        const selections: OptionSelection[] = sub.Abstain ? [] : sub.Selections.filter((s) => known.has(s.OptionID.toLowerCase()));
        out.push({ Weight: BallotWeight(ballot.WeightClass, classWeights), Abstain: sub.Abstain === true, Selections: selections });
    }
    return out;
}

/** The full TallyContestInput for a contest. */
export function BuildContestInput(
    plan: ContestPlan,
    ballots: readonly DecryptedBallot[],
    classWeights: Record<string, number>,
    eligibleWeight: number,
    tieBreakSeed: string
): TallyContestInput {
    const input: TallyContestInput = {
        ContestID: plan.ContestID,
        Seats: plan.Seats,
        OptionIDs: plan.OptionIDs.slice(),
        Kind: plan.Kind,
        Threshold: plan.Threshold,
        ThresholdBasis: plan.ThresholdBasis,
        EligibleWeight: eligibleWeight,
        Ballots: BuildContestBallots(plan, ballots, classWeights),
        TieBreakSeed: tieBreakSeed,
    };
    if (plan.CustomThreshold !== null) input.CustomThreshold = plan.CustomThreshold;
    return input;
}

// --- Quorum -------------------------------------------------------------------------------------------

export interface QuorumEvaluation {
    /** True when the election configures a quorum. */
    Required: boolean;
    Met: boolean;
}

/**
 * Quorum on turnout (distinct counted ballots against the roll). Count: at least Value ballots. Percent: at least Value
 * percent of the eligible voters. No quorum configured means met.
 */
export function EvaluateQuorum(quorum: IElectionConfiguration['Quorum'] | undefined, ballotsCounted: number, eligibleCount: number): QuorumEvaluation {
    if (!quorum || !(quorum.Value > 0)) return { Required: false, Met: true };
    if (quorum.Kind === 'Count') return { Required: true, Met: ballotsCounted >= quorum.Value };
    if (eligibleCount <= 0) return { Required: true, Met: false };
    return { Required: true, Met: (ballotsCounted / eligibleCount) * 100 >= quorum.Value };
}

// --- Result rows ----------------------------------------------------------------------------------------

export type ContestResultOutcome = 'Decided' | 'Failed' | 'NoQuorum' | 'Passed' | 'Tied' | 'Void';

export interface OptionResultRow {
    OptionID: string;
    Votes: number;
    Position: number;
    Outcome: TallyOptionOutcome;
}

export interface ContestResultRow {
    ContestID: string;
    Outcome: ContestResultOutcome;
    BallotsCounted: number;
    Abstentions: number;
    EligibleCount: number;
    VotesCast: number;
    /** JSON of the tally rounds; null for single-round methods with no rounds. */
    Rounds: string | null;
    TieBreakSeed: string;
    TieBreakNotes: string | null;
    Options: OptionResultRow[];
}

/** NoQuorum overrides the tally's outcome; otherwise the tally's outcome stands. */
export function MapContestOutcome(outcome: TallyOutcome['Outcome'], quorumMet: boolean): ContestResultOutcome {
    return quorumMet ? outcome : 'NoQuorum';
}

/** Without a quorum nobody is elected: option outcomes collapse to Counted (positions and votes remain for the record). */
export function MapOptionOutcome(outcome: TallyOptionOutcome, quorumMet: boolean): TallyOptionOutcome {
    return quorumMet ? outcome : 'Counted';
}

export function BuildTieBreakNotes(outcome: TallyOutcome, plan: ContestPlan, quorumMet: boolean): string | null {
    const notes: string[] = [...outcome.Notes];
    if (!quorumMet) notes.push('Quorum was not met; no candidate or motion is declared.');
    if (outcome.TieBroken && plan.TieBreakMethod === 'Administrator') {
        notes.push('This contest asks for an administrator tie-break; the lot result recorded here is provisional.');
    }
    return notes.length > 0 ? notes.join('\n') : null;
}

/** Maps a tally outcome to the rows the engine writes (ContestResult + one ContestOptionResult per option). */
export function BuildContestResultRow(
    plan: ContestPlan,
    outcome: TallyOutcome,
    input: TallyContestInput,
    eligibleCount: number,
    quorumMet: boolean
): ContestResultRow {
    return {
        ContestID: plan.ContestID,
        Outcome: MapContestOutcome(outcome.Outcome, quorumMet),
        BallotsCounted: input.Ballots.length,
        Abstentions: outcome.Abstentions,
        EligibleCount: eligibleCount,
        VotesCast: outcome.VotesCast,
        Rounds: outcome.Rounds.length > 0 ? JSON.stringify(outcome.Rounds) : null,
        TieBreakSeed: input.TieBreakSeed,
        TieBreakNotes: BuildTieBreakNotes(outcome, plan, quorumMet),
        Options: outcome.Options.map((o) => ({
            OptionID: o.OptionID,
            Votes: o.Votes,
            Position: o.Position,
            Outcome: MapOptionOutcome(o.Outcome, quorumMet),
        })),
    };
}

// --- BallotSelection rows ------------------------------------------------------------------------------------

export interface BallotSelectionRow {
    ContestID: string;
    ContestOptionID: string | null;
    Rank: number | null;
    WriteInText: string | null;
    IsAbstain: boolean;
}

/** The rows one ballot contributes for the contests of the election. Satisfies the table's OneChoice check. */
export function SelectionRowsForBallot(submission: BallotSubmission, validContestIDs: ReadonlySet<string>): BallotSelectionRow[] {
    const rows: BallotSelectionRow[] = [];
    for (const c of submission.Contests) {
        if (!validContestIDs.has(c.ContestID.toLowerCase())) continue;
        rows.push(...RowsForContest(c));
    }
    return rows;
}

function RowsForContest(c: ContestSubmission): BallotSelectionRow[] {
    if (c.Abstain) return [{ ContestID: c.ContestID, ContestOptionID: null, Rank: null, WriteInText: null, IsAbstain: true }];
    return c.Selections.map((s) => ({
        ContestID: c.ContestID,
        ContestOptionID: s.OptionID,
        Rank: s.Rank !== undefined && s.Rank >= 1 ? s.Rank : null,
        WriteInText: s.WriteInText && s.WriteInText.trim() !== '' ? s.WriteInText : null,
        IsAbstain: false,
    }));
}

// --- Certification hash ------------------------------------------------------------------------------------------

/** The fields of a counted CastBallot that identify it for the ballot-set hash (never its selections). */
export interface BallotIdentity {
    ID: string;
    BallotStyleHash: string;
    ReceiptCode: string;
}

/**
 * Sha256Hex of the sorted list of `${ID}:${BallotStyleHash}:${ReceiptCode}` (ID lower-cased so the hash does not depend on
 * how the database cases a uniqueidentifier). Deterministic for a given ballot set whatever the load order.
 */
export function ComputeBallotSetHash(ballots: readonly BallotIdentity[]): string {
    const lines = ballots.map((b) => `${b.ID.toLowerCase()}:${b.BallotStyleHash}:${b.ReceiptCode}`).sort();
    return Sha256Hex(lines.join('\n'));
}
