import type { TallyContestInput, TallyOutcome, TallyOptionResult } from '../types.js';
import { BaseTallyMethodContract } from '../types.js';
import { SeededRandom } from './rng.js';
import {
  RoundVotes,
  CountAllSelections,
  ComputeVotesCastAndAbstentions,
  RankWithTies,
} from './common.js';

/**
 * Approval voting: each selected option gets the full ballot weight.
 * Top `Seats` options are Elected, rest are Defeated.
 *
 * Motion/Question/Amendment kinds are not supported (not a ranked method).
 * Outcome for these kinds is Void with a note.
 *
 * Ties at the seat boundary are broken by lot (TieBroken=true).
 */
export class ApprovalTallyMethod extends BaseTallyMethodContract {
  public readonly Code = 'approval';

  public Tally(input: TallyContestInput): TallyOutcome {
    const { OptionIDs, Kind, Seats, Ballots, TieBreakSeed } = input;

    const { VotesCast, Abstentions } = ComputeVotesCastAndAbstentions(Ballots);

    // Motion kinds not supported in approval
    if (Kind === 'Motion' || Kind === 'Question' || Kind === 'Amendment' || Kind === 'StandardsItem') {
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
        Notes: ['Approval voting is not supported for motion-style contests'],
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

    // Count all selections (each selected option on a ballot gets weight)
    const totals = CountAllSelections(Ballots, OptionIDs);

    const rng = new SeededRandom(TieBreakSeed);
    const { ordered, tieBroken } = RankWithTies(totals, OptionIDs, Seats, rng);

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
