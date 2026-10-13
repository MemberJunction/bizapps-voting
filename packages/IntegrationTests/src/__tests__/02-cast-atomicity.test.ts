import { describe, expect, it } from 'vitest';
import { GetHarness } from '../support/harness.js';
import { CastVote, CreateOpenElection, CreatePeople, LoadRoll, Scalar, VotingSchema } from '../support/world.js';

const h = await GetHarness();

describe.skipIf(!h)('2. Cast is all-or-nothing', () => {
    it('refuses a second cast by the same voter and leaves exactly one Participation and one CastBallot', async () => {
        if (!h) return;
        const schema = await VotingSchema(h);
        const voters = await CreatePeople(h, 3, 'dup');
        const electionID = await CreateOpenElection(h, { Voters: voters, Overrides: { SecrecyMode: 'Secret' } });
        const [a] = await LoadRoll(h, electionID);

        const first = await CastVote(h, electionID, a.EligibleVoterID, 0);
        expect(first.Success, `first cast: ${first.Code} ${first.Message}`).toBe(true);

        const second = await CastVote(h, electionID, a.EligibleVoterID, 1);
        expect(second.Success).toBe(false);
        expect(second.Code).toBe('AlreadyVoted');

        const participations = await Scalar<number>(h, `SELECT COUNT(*) FROM [${schema}].[Participation] WHERE ElectionID = @e AND EligibleVoterID = @v`, {
            e: electionID,
            v: a.EligibleVoterID,
        });
        const ballots = await Scalar<number>(h, `SELECT COUNT(*) FROM [${schema}].[CastBallot] WHERE ElectionID = @e`, { e: electionID });
        expect(participations).toBe(1);
        expect(ballots).toBe(1);
        // The surviving ballot is the first cast's: its receipt is on file, the second attempt's never was issued.
        const surviving = await Scalar<number>(h, `SELECT COUNT(*) FROM [${schema}].[CastBallot] WHERE ElectionID = @e AND ReceiptCode = @r`, {
            e: electionID,
            r: first.ReceiptCode!,
        });
        expect(surviving).toBe(1);
    });

    it('a cast with a bad ballot-style hash writes nothing', async () => {
        if (!h) return;
        const schema = await VotingSchema(h);
        const voters = await CreatePeople(h, 3, 'hash');
        const electionID = await CreateOpenElection(h, { Voters: voters, Overrides: { SecrecyMode: 'Secret' } });
        const roll = await LoadRoll(h, electionID);

        const bad = await CastVote(h, electionID, roll[0].EligibleVoterID, 0, { BallotStyleHash: 'not-the-hash' });
        expect(bad.Success).toBe(false);
        expect(bad.Code).toBe('BallotStyleChanged');

        expect(await Scalar<number>(h, `SELECT COUNT(*) FROM [${schema}].[Participation] WHERE ElectionID = @e`, { e: electionID })).toBe(0);
        expect(await Scalar<number>(h, `SELECT COUNT(*) FROM [${schema}].[CastBallot] WHERE ElectionID = @e`, { e: electionID })).toBe(0);

        // The refusal did not burn the voter: a correct cast afterwards succeeds.
        const ok = await CastVote(h, electionID, roll[0].EligibleVoterID, 0);
        expect(ok.Success, `retry: ${ok.Code}`).toBe(true);
    });

    it("a cast using another election's roll entry is refused and writes nothing", async () => {
        if (!h) return;
        const schema = await VotingSchema(h);
        const voters = await CreatePeople(h, 2, 'xelec');
        const electionA = await CreateOpenElection(h, { Voters: voters, Overrides: { SecrecyMode: 'Secret' } });
        const electionB = await CreateOpenElection(h, { Voters: voters, Overrides: { SecrecyMode: 'Secret' } });
        const rollB = await LoadRoll(h, electionB);

        const refused = await CastVote(h, electionA, rollB[0].EligibleVoterID, 0);
        expect(refused.Success).toBe(false);
        expect(refused.Code).toBe('NotEligible');
        expect(await Scalar<number>(h, `SELECT COUNT(*) FROM [${schema}].[Participation] WHERE ElectionID = @e`, { e: electionA })).toBe(0);
        expect(await Scalar<number>(h, `SELECT COUNT(*) FROM [${schema}].[CastBallot] WHERE ElectionID = @e`, { e: electionA })).toBe(0);
    });
});
