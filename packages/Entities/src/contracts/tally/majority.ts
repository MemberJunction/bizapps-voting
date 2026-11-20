import type { TallyContestInput, TallyOutcome, TallyOptionResult } from '../types.js';
import { BaseTallyMethodContract } from '../types.js';
import { SeededRandom } from './rng.js';
import {
  RoundVotes,
  CountFirstChoices,
  ComputeVotesCastAndAbstentions,
  RankWithTies,
} from './common.js';
import { MeetsThreshold } from './threshold.js';

/**
 * Majority tally method.
 *
 * For Motion/Question/Amendment/StandardsItem kinds:
 *   - First option (by Sequence) is the affirmative (Yes).
 *   - Passed if yes votes meet the threshold.
 *   - Outcome: Passed/Failed
 *   - Options outcome: Counted
 *
 * For Office (single seat, Seats=1):
 *   - Leading option is Elected only if it meets the threshold over the basis.
 *   - If no option meets threshold: Outcome='Failed', all options Defeated.
 *   - Tie for the lead can be broken by lot (TieBroken=true).
 *
 * For Office (multi-seat, Seats>1):
 *   - Elect all options that meet the threshold, up to Seats.
 *   - Remaining are Defeated.
 */
export class MajorityTallyMethod extends BaseTallyMethodContract {
  public readonly Code = 'majority';

  public Tally(input: TallyContestInput): TallyOutcome {
    const {
      OptionIDs,
      Kind,
      Seats,
      Threshold,
      CustomThreshold,
      ThresholdBasis,
      EligibleWeight,
      Ballots,
      TieBreakSeed,
    } = input;

    const { VotesCast, Abstentions } = ComputeVotesCastAndAbstentions(Ballots);

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

    // Count first choices
    const totals = CountFirstChoices(Ballots, OptionIDs);

    // Determine basis for threshold (VotesCast vs Eligible)
    const basis = ThresholdBasis === 'Eligible' ? EligibleWeight : VotesCast;

    // Handle Motion/Question/Amendment/StandardsItem
    if (Kind === 'Motion' || Kind === 'Question' || Kind === 'Amendment' || Kind === 'StandardsItem') {
      // First option is Yes, second is No (if present)
      const yesVotes = totals[OptionIDs[0]] ?? 0;
      // The opposing votes: every non-affirmative option (normally just "No"). Threshold 'None' is decided by yes > no,
      // so passing 0 here would let a tie (or any losing motion with one yes vote) pass.
      const noVotes = OptionIDs.slice(1).reduce((sum, oid) => sum + (totals[oid] ?? 0), 0);

      const passed = MeetsThreshold(yesVotes, noVotes, basis, Threshold, CustomThreshold);

      const rng = new SeededRandom(TieBreakSeed);
      const { ordered, tieBroken } = RankWithTies(totals, OptionIDs, Seats, rng);

      const ranking = new Map<string, number>();
      ordered.forEach((oid, idx) => {
        ranking.set(oid, idx + 1);
      });

      const options: TallyOptionResult[] = OptionIDs.map((oid) => ({
        OptionID: oid,
        Votes: RoundVotes(totals[oid] ?? 0),
        Position: ranking.get(oid) ?? OptionIDs.length,
        Outcome: 'Counted' as const,
      }));

      const notes: string[] = [];
      if (tieBroken) {
        notes.push('Tie broken by lot');
      }

      return {
        Outcome: passed ? 'Passed' : 'Failed',
        VotesCast,
        Abstentions,
        Options: options,
        Rounds: [],
        TieBroken: tieBroken,
        Notes: notes,
      };
    }

    // Handle Office elections
    const rng = new SeededRandom(TieBreakSeed);
    const { ordered, tieBroken } = RankWithTies(totals, OptionIDs, Seats, rng);

    if (Seats === 1) {
      // Single-seat office
      const leader = ordered[0];
      const leaderVotes = totals[leader] ?? 0;

      // Check if leader meets threshold
      const meetsThreshold = MeetsThreshold(leaderVotes, 0, basis, Threshold, CustomThreshold);

      if (!meetsThreshold) {
        // No candidate reached threshold
        const ranking = new Map<string, number>();
        ordered.forEach((oid, idx) => {
          ranking.set(oid, idx + 1);
        });

        const options: TallyOptionResult[] = OptionIDs.map((oid) => ({
          OptionID: oid,
          Votes: RoundVotes(totals[oid] ?? 0),
          Position: ranking.get(oid) ?? OptionIDs.length,
          Outcome: 'Defeated' as const,
        }));

        return {
          Outcome: 'Failed',
          VotesCast,
          Abstentions,
          Options: options,
          Rounds: [],
          TieBroken: tieBroken,
          Notes: ['No candidate reached the threshold'],
        };
      }

      // Leader meets threshold
      const ranking = new Map<string, number>();
      ordered.forEach((oid, idx) => {
        ranking.set(oid, idx + 1);
      });

      const options: TallyOptionResult[] = OptionIDs.map((oid) => {
        const position = ranking.get(oid) ?? OptionIDs.length;
        const outcome: 'Elected' | 'Defeated' = oid === leader ? 'Elected' : 'Defeated';
        return {
          OptionID: oid,
          Votes: RoundVotes(totals[oid] ?? 0),
          Position: position,
          Outcome: outcome,
        };
      });

      const notes: string[] = [];
      if (tieBroken) {
        notes.push('Tie broken by lot');
      }

      return {
        Outcome: 'Decided',
        VotesCast,
        Abstentions,
        Options: options,
        Rounds: [],
        TieBroken: tieBroken,
        Notes: notes,
      };
    } else {
      // Multi-seat office: elect all that meet threshold, up to Seats
      const qualified: string[] = [];
      for (const oid of ordered) {
        const votes = totals[oid] ?? 0;
        if (MeetsThreshold(votes, 0, basis, Threshold, CustomThreshold)) {
          qualified.push(oid);
          if (qualified.length >= Seats) break;
        }
      }

      const ranking = new Map<string, number>();
      ordered.forEach((oid, idx) => {
        ranking.set(oid, idx + 1);
      });

      const options: TallyOptionResult[] = OptionIDs.map((oid) => {
        const position = ranking.get(oid) ?? OptionIDs.length;
        const outcome: 'Elected' | 'Defeated' = qualified.includes(oid) ? 'Elected' : 'Defeated';
        return {
          OptionID: oid,
          Votes: RoundVotes(totals[oid] ?? 0),
          Position: position,
          Outcome: outcome,
        };
      });

      const notes: string[] = [];
      if (tieBroken) {
        notes.push('Tie broken by lot');
      }

      return {
        Outcome: 'Decided',
        VotesCast,
        Abstentions,
        Options: options,
        Rounds: [],
        TieBroken: tieBroken,
        Notes: notes,
      };
    }
  }
}
