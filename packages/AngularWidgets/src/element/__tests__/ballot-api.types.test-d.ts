/**
 * Compile-time contract check (run by vitest typecheck): the element's local wire types must be structurally identical to
 * the generated remote-operation types. Test files are not bundled, so importing the (MJ-core-bearing) entities barrel is fine.
 */
import { describe, expectTypeOf, it } from 'vitest';
import type * as Gen from '@mj-biz-apps/voting-entities';
import type * as Local from '../api/ballot-api.types';

describe('local wire types match the generated remote operations', () => {
  it('GetMyBallot', () => {
    expectTypeOf<Local.VotingGetMyBallotInput>().toEqualTypeOf<Gen.VotingGetMyBallotInput>();
    expectTypeOf<Local.VotingGetMyBallotOutput['Success']>().toEqualTypeOf<Gen.VotingGetMyBallotOutput['Success']>();
    expectTypeOf<Local.VotingGetMyBallotOutput['HasVoted']>().toEqualTypeOf<Gen.VotingGetMyBallotOutput['HasVoted']>();
    expectTypeOf<Local.VotingGetMyBallotOutput['CanRevote']>().toEqualTypeOf<Gen.VotingGetMyBallotOutput['CanRevote']>();
    expectTypeOf<Local.VotingGetMyBallotOutput['ReceiptCode']>().toEqualTypeOf<Gen.VotingGetMyBallotOutput['ReceiptCode']>();
    expectTypeOf<Local.VotingGetMyBallotOutput['Message']>().toEqualTypeOf<Gen.VotingGetMyBallotOutput['Message']>();
    // Style: assignable both ways (contracts BallotStyle <-> generated VotingBallotStyle)
    expectTypeOf<Local.VotingGetMyBallotOutput['Style']>().toEqualTypeOf<Gen.VotingGetMyBallotOutput['Style']>();
    expectTypeOf<Gen.VotingGetMyBallotOutput>().toExtend<Local.VotingGetMyBallotOutput>();
    expectTypeOf<Local.VotingGetMyBallotOutput>().toExtend<Gen.VotingGetMyBallotOutput>();
  });

  it('CastBallot', () => {
    expectTypeOf<Local.VotingCastBallotInput>().toEqualTypeOf<Gen.VotingCastBallotInput>();
    expectTypeOf<Local.VotingCastBallotOutput>().toEqualTypeOf<Gen.VotingCastBallotOutput>();
  });

  it('GetResults', () => {
    expectTypeOf<Local.VotingGetResultsInput>().toEqualTypeOf<Gen.VotingGetResultsInput>();
    expectTypeOf<Local.VotingGetResultsOutput>().toEqualTypeOf<Gen.VotingGetResultsOutput>();
    expectTypeOf<Local.VotingContestOutcome>().toEqualTypeOf<Gen.VotingContestOutcome>();
  });

  it('GetMyParticipation', () => {
    expectTypeOf<Local.VotingGetMyParticipationInput>().toEqualTypeOf<Gen.VotingGetMyParticipationInput>();
    expectTypeOf<Local.VotingGetMyParticipationOutput>().toEqualTypeOf<Gen.VotingGetMyParticipationOutput>();
  });
});
