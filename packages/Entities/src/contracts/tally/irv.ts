import type { TallyBallot, TallyContestInput, TallyOutcome, TallyRound, TallyOptionResult } from '../types.js';
import { BaseTallyMethodContract } from '../types.js';
import { SeededRandom } from './rng.js';
import { RoundVotes, ComputeVotesCastAndAbstentions } from './common.js';

/**
 * Instant Runoff Voting (IRV) for single-seat elections.
 *
 * Process:
 * 1. Each round, count each continuing ballot for its highest-ranked continuing option.
 * 2. If any option has > 50% of continuing votes (non-exhausted), it is Elected.
 * 3. Otherwise, exclude the option with the lowest count.
 * 4. For ties in lowest: use prior-round totals (going backwards) to break; if still tied, use lot.
 * 5. Record every round.
 *
 * If Seats > 1, return Void with a note (use STV instead).
 * If two options remain and tie, break by lot.
 * Final positions: winner position 1, then in reverse order of exclusion.
 */
export class IrvTallyMethod extends BaseTallyMethodContract {
  public readonly Code = 'irv';

  public Tally(input: TallyContestInput): TallyOutcome {
    const { OptionIDs, Seats, Ballots, TieBreakSeed } = input;

    const { VotesCast, Abstentions } = ComputeVotesCastAndAbstentions(Ballots);

    // Multi-seat not supported
    if (Seats > 1) {
      return {
        Outcome: 'Void',
        VotesCast,
        Abstentions,
        Options: OptionIDs.map((oid) => ({
          OptionID: oid,
          Votes: 0,
          Position: OptionIDs.length,
          Outcome: 'Defeated',
        })),
        Rounds: [],
        TieBroken: false,
        Notes: ['IRV is for single-seat elections; use STV for multi-seat'],
      };
    }

    // No ballots case
    if (VotesCast === 0) {
      return {
        Outcome: 'Void',
        VotesCast,
        Abstentions,
        Options: OptionIDs.map((oid) => ({
          OptionID: oid,
          Votes: 0,
          Position: OptionIDs.length,
          Outcome: 'Defeated',
        })),
        Rounds: [],
        TieBroken: false,
        Notes: ['No ballots cast'],
      };
    }

    const rng = new SeededRandom(TieBreakSeed);

    // Track which options are still continuing
    const continuing = new Set(OptionIDs);

    // Track tallies for each round (for tie-breaking)
    const roundTallies: Record<string, number>[] = [];

    // Track exclusion order
    const exclusionOrder: string[] = [];

    // Create a copy of ballots with their highest-ranked continuing option
    type ActivatedBallot = { ballot: TallyBallot; activatedOption: string | null };
    const activatedBallots: ActivatedBallot[] = Ballots.map((ballot) => {
      if (ballot.Abstain || ballot.Selections.length === 0) {
        return { ballot, activatedOption: null };
      }

      // Find the first continuing option in the ballot's Rank order
      // (Rank 1 is first preference)
      const sorted = [...ballot.Selections].sort((a, b) => (a.Rank ?? 0) - (b.Rank ?? 0));
      const activated = sorted.find((s) => continuing.has(s.OptionID));
      return { ballot, activatedOption: activated?.OptionID ?? null };
    });

    const rounds: TallyRound[] = [];
    let roundNum = 1;
    let elected: string | null = null;
    let tieBroken = false;

    while (continuing.size > 1) {
      // Count each activated ballot for its continuing option
      const tallies: Record<string, number> = {};
      for (const oid of continuing) {
        tallies[oid] = 0;
      }

      let exhausted = 0;
      for (const { ballot, activatedOption } of activatedBallots) {
        if (ballot.Abstain || ballot.Selections.length === 0) {
          // Abstaining ballot
          continue;
        }

        // Find this ballot's highest-ranked continuing option
        const sorted = [...ballot.Selections].sort((a, b) => (a.Rank ?? 0) - (b.Rank ?? 0));
        const continuing_option = sorted.find((s) => continuing.has(s.OptionID));

        if (continuing_option) {
          tallies[continuing_option.OptionID] += ballot.Weight;
        } else {
          // No continuing option: ballot is exhausted
          exhausted += ballot.Weight;
        }
      }

      // Round tally recorded with votes rounded
      roundTallies.push(Object.fromEntries(Object.entries(tallies).map(([k, v]) => [k, RoundVotes(v)])));

      const totalContinuing = Object.values(tallies).reduce((a, b) => a + b, 0);
      const halfContinuing = totalContinuing / 2;

      // Check for winner
      const winners = Array.from(continuing).filter((oid) => tallies[oid] > halfContinuing);
      if (winners.length === 1) {
        elected = winners[0];
        const roundTalliesForRound: Record<string, number> = {};
        for (const oid of continuing) {
          roundTalliesForRound[oid] = RoundVotes(tallies[oid]);
        }
        rounds.push({
          Round: roundNum,
          Tallies: roundTalliesForRound,
          Elected: [elected],
          Excluded: [],
          Exhausted: RoundVotes(exhausted),
        });
        break;
      }

      // Find lowest (to exclude)
      const lowestVotes = Math.min(...Array.from(continuing).map((oid) => tallies[oid]));
      const lowestOids = Array.from(continuing).filter((oid) => tallies[oid] === lowestVotes);

      let toExclude: string;
      if (lowestOids.length === 1) {
        toExclude = lowestOids[0];
      } else {
        // Tie: use prior rounds to break
        // Go backwards through roundTallies to find which option had lower votes
        let tieBreaker = lowestOids;
        for (let i = roundTallies.length - 2; i >= 0; i--) {
          const priorTallies = roundTallies[i];
          const minPrior = Math.min(...tieBreaker.map((oid) => priorTallies[oid] ?? 0));
          const tieBeaker2 = tieBreaker.filter((oid) => (priorTallies[oid] ?? 0) === minPrior);
          if (tieBeaker2.length === 1) {
            tieBreaker = tieBeaker2;
            break;
          }
          tieBreaker = tieBeaker2;
        }

        // If still tied, use lot
        if (tieBreaker.length > 1) {
          tieBroken = true;
          toExclude = rng.Pick(tieBreaker);
        } else {
          toExclude = tieBreaker[0];
        }
      }

      // Record round
      const roundTalliesForRound: Record<string, number> = {};
      for (const oid of continuing) {
        roundTalliesForRound[oid] = RoundVotes(tallies[oid]);
      }
      rounds.push({
        Round: roundNum,
        Tallies: roundTalliesForRound,
        Elected: [],
        Excluded: [toExclude],
        Exhausted: RoundVotes(exhausted),
      });

      continuing.delete(toExclude);
      exclusionOrder.push(toExclude);
      roundNum++;
    }

    // If only one option remains, it's elected
    if (continuing.size === 1 && !elected) {
      elected = Array.from(continuing)[0];
      const finalTallies: Record<string, number> = {};
      for (const oid of OptionIDs) {
        finalTallies[oid] = 0;
      }
      for (const { ballot } of activatedBallots) {
        if (ballot.Abstain || ballot.Selections.length === 0) continue;
        const sorted = [...ballot.Selections].sort((a, b) => (a.Rank ?? 0) - (b.Rank ?? 0));
        const option = sorted.find((s) => s.OptionID === elected);
        if (option) {
          finalTallies[elected] += ballot.Weight;
        }
      }
      rounds.push({
        Round: roundNum,
        Tallies: Object.fromEntries(Object.entries(finalTallies).map(([k, v]) => [k, RoundVotes(v)])),
        Elected: [elected],
        Excluded: [],
      });
    }

    // Build final positions: winner is 1, then reverse exclusion order
    const finalPositions = new Map<string, number>();
    if (elected) {
      finalPositions.set(elected, 1);
    }
    for (let i = 0; i < exclusionOrder.length; i++) {
      finalPositions.set(exclusionOrder[i], exclusionOrder.length - i + 1);
    }

    // Count final votes for elected option
    const finalVotesCount: Record<string, number> = {};
    for (const oid of OptionIDs) {
      finalVotesCount[oid] = 0;
    }
    if (elected) {
      for (const { ballot } of activatedBallots) {
        if (ballot.Abstain || ballot.Selections.length === 0) continue;
        const sorted = [...ballot.Selections].sort((a, b) => (a.Rank ?? 0) - (b.Rank ?? 0));
        const option = sorted.find((s) => s.OptionID === elected);
        if (option) {
          finalVotesCount[elected] += ballot.Weight;
        }
      }
    }

    const options: TallyOptionResult[] = OptionIDs.map((oid) => {
      const outcome: 'Elected' | 'Defeated' = elected === oid ? 'Elected' : 'Defeated';
      return {
        OptionID: oid,
        Votes: RoundVotes(finalVotesCount[oid]),
        Position: finalPositions.get(oid) ?? OptionIDs.length,
        Outcome: outcome,
      };
    });

    const notes: string[] = [];
    if (tieBroken) {
      notes.push('Lowest-rank tie broken by lot');
    }

    return {
      Outcome: 'Decided',
      VotesCast,
      Abstentions,
      Options: options,
      Rounds: rounds,
      TieBroken: tieBroken,
      Notes: notes,
    };
  }
}
