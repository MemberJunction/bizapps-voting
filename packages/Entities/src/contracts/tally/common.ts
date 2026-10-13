import type { TallyBallot, TallyOptionResult, TallyRound } from '../types.js';
import { SeededRandom } from './rng.js';

/**
 * Round a number to 6 decimal places.
 */
export function RoundVotes(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Count first-choice votes for each option across non-abstaining ballots.
 * Returns a map of optionID → vote count (weighted).
 */
export function CountFirstChoices(
  ballots: readonly TallyBallot[],
  optionIDs: readonly string[]
): Record<string, number> {
  const totals: Record<string, number> = {};

  for (const optionID of optionIDs) {
    totals[optionID] = 0;
  }

  for (const ballot of ballots) {
    if (ballot.Abstain || ballot.Selections.length === 0) {
      continue; // Skip abstaining or empty ballots
    }

    // First selection is first choice (Rank 1)
    const firstSelection = ballot.Selections[0];
    if (firstSelection.OptionID in totals) {
      totals[firstSelection.OptionID] += ballot.Weight;
    }
  }

  return Object.fromEntries(
    Object.entries(totals).map(([oid, count]) => [oid, RoundVotes(count)])
  );
}

/**
 * Count all selections (approvals) for each option across non-abstaining ballots.
 * Returns a map of optionID → vote count (weighted).
 */
export function CountAllSelections(
  ballots: readonly TallyBallot[],
  optionIDs: readonly string[]
): Record<string, number> {
  const totals: Record<string, number> = {};

  for (const optionID of optionIDs) {
    totals[optionID] = 0;
  }

  for (const ballot of ballots) {
    if (ballot.Abstain || ballot.Selections.length === 0) {
      continue;
    }

    for (const selection of ballot.Selections) {
      if (selection.OptionID in totals) {
        totals[selection.OptionID] += ballot.Weight;
      }
    }
  }

  return Object.fromEntries(
    Object.entries(totals).map(([oid, count]) => [oid, RoundVotes(count)])
  );
}

/**
 * Compute votes cast (sum of ballot weights, excluding abstentions)
 * and abstentions (weight of abstaining ballots).
 */
export function ComputeVotesCastAndAbstentions(
  ballots: readonly TallyBallot[]
): { VotesCast: number; Abstentions: number } {
  let votesCast = 0;
  let abstentions = 0;

  for (const ballot of ballots) {
    if (ballot.Abstain || ballot.Selections.length === 0) {
      abstentions += ballot.Weight;
    } else {
      votesCast += ballot.Weight;
    }
  }

  return { VotesCast: RoundVotes(votesCast), Abstentions: RoundVotes(abstentions) };
}

/**
 * Rank options by their totals. Deterministically break ties using a seeded RNG.
 *
 * Returns:
 * - ordered: list of optionIDs in descending order by votes
 * - tieBroken: true if a lot was drawn to break a tie
 *
 * Tie-breaking: when two or more options have the same votes,
 * shuffle them using the seeded RNG and pick the order.
 */
export function RankWithTies(
  totals: Record<string, number>,
  optionIDs: readonly string[],
  seats: number,
  rng: SeededRandom
): { ordered: string[]; tieBroken: boolean } {
  // Sort by votes descending, then deterministically break ties
  const oidWithVotes = optionIDs.map((oid) => ({
    oid,
    votes: totals[oid] ?? 0,
  }));

  // Group by vote count
  const byVotes = new Map<number, string[]>();
  for (const { oid, votes } of oidWithVotes) {
    if (!byVotes.has(votes)) {
      byVotes.set(votes, []);
    }
    byVotes.get(votes)!.push(oid);
  }

  const sortedVotes = Array.from(byVotes.keys()).sort((a, b) => b - a);

  const ordered: string[] = [];
  let tieBroken = false;

  for (const votes of sortedVotes) {
    const tied = byVotes.get(votes)!;
    if (tied.length > 1) {
      // Tie: shuffle to break it
      tieBroken = true;
      const shuffled = rng.Shuffle(tied);
      ordered.push(...shuffled);
    } else {
      ordered.push(tied[0]);
    }
  }

  return { ordered, tieBroken };
}

/**
 * Build TallyOptionResult array from option IDs, totals, and a final ranking.
 *
 * @param optionIDs all option IDs in ballot order
 * @param totals vote counts per option
 * @param ranking final ranking (ordered from winner to last); map of optionID → position (1-based)
 * @param outcome outcome value for each option ('Elected', 'Defeated', 'Counted', etc.)
 */
export function BuildOptionResults(
  optionIDs: readonly string[],
  totals: Record<string, number>,
  ranking: Map<string, number>,
  outcome: 'Elected' | 'Defeated' | 'Excluded' | 'Tied' | 'Counted'
): TallyOptionResult[] {
  return optionIDs.map((oid) => ({
    OptionID: oid,
    Votes: RoundVotes(totals[oid] ?? 0),
    Position: ranking.get(oid) ?? optionIDs.length,
    Outcome: outcome,
  }));
}
