import type { TallyContestInput, TallyOutcome, TallyOptionResult } from '../types.js';
import { BaseTallyMethodContract } from '../types.js';
import { SeededRandom } from './rng.js';
import {
  RoundVotes,
  CountAllSelections,
  ComputeVotesCastAndAbstentions,
  RankWithTies,
  BuildOptionResults,
} from './common.js';

/**
 * Plurality tally: each selected option gets the full ballot weight.
 * Top `Seats` winners are Elected, rest are Defeated.
 *
 * Ties at the seat boundary are broken by lot (TieBroken=true, Note recorded).
 *
 * For Motion/Question/Amendment kinds: if yes > no, Passed; otherwise Failed (tie fails).
 * Options outcome is 'Counted' for these kinds.
 *
 * Outcome is 'Decided' for other kinds, 'Void' if no ballots.
 */
export class PluralityTallyMethod extends BaseTallyMethodContract {
  public readonly Code = 'plurality';

  public Tally(input: TallyContestInput): TallyOutcome {
    const { ContestID, Seats, OptionIDs, Kind, Ballots, TieBreakSeed } = input;

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

    // Count each selection (each selected option on a ballot gets weight)
    const totals = CountAllSelections(Ballots, OptionIDs);

    const rng = new SeededRandom(TieBreakSeed);
    const { ordered, tieBroken } = RankWithTies(totals, OptionIDs, Seats, rng);

    // Determine outcomes based on kind
    if (Kind === 'Motion' || Kind === 'Question' || Kind === 'Amendment') {
      // For motions: first option is affirmative (Yes), second is no
      // Passed if yes > no, Failed otherwise (tie fails)
      const yesVotes = totals[OptionIDs[0]] ?? 0;
      const noVotes = totals[OptionIDs[1]] ?? 0;

      const passed = yesVotes > noVotes;
      const outcome = passed ? 'Passed' : 'Failed';

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
        Outcome: outcome,
        VotesCast,
        Abstentions,
        Options: options,
        Rounds: [],
        TieBroken: tieBroken,
        Notes: notes,
      };
    }

    // For Office and other kinds: elect top Seats
    const ranking = new Map<string, number>();
    ordered.forEach((oid, idx) => {
      ranking.set(oid, idx + 1);
    });

    const options: TallyOptionResult[] = OptionIDs.map((oid) => {
      const position = ranking.get(oid) ?? OptionIDs.length;
      const outcome: 'Elected' | 'Defeated' = position <= Seats ? 'Elected' : 'Defeated';
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
