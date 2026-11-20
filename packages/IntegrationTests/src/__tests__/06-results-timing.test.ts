import { describe, expect, it } from 'vitest';
import { CastEngine, ElectionAdministrationEngine, ResultsEngine, TallyEngine } from '@mj-biz-apps/voting-server';
import { GetHarness } from '../support/harness.js';
import { CastVote, CreateOpenElection, CreatePeople, LoadRoll, Must, QuestionContest, Scalar, VotingSchema } from '../support/world.js';

const h = await GetHarness();

type ResultsViewer = Parameters<ResultsEngine['GetResults']>[1];

const VOTER: ResultsViewer = { IsAdministrator: false, IsEligible: true, HasVoted: true, IsHostMember: false };
const ADMIN: ResultsViewer = { IsAdministrator: true, IsEligible: false, HasVoted: false, IsHostMember: false };

describe.skipIf(!h)('6. Results timing and attribution', () => {
    it('an AfterClose election shows nothing (Visible=false) before close, then the final result after the tally', async () => {
        if (!h) return;
        const voters = await CreatePeople(h, 3, 'after');
        const electionID = await CreateOpenElection(h, { Voters: voters, Overrides: { SecrecyMode: 'Secret', ResultsTiming: 'AfterClose' } });
        const roll = await LoadRoll(h, electionID);
        expect((await CastVote(h, electionID, roll[0].EligibleVoterID, 0)).Success).toBe(true);

        for (const viewer of [VOTER, ADMIN]) {
            const during = Must(await ResultsEngine.Instance.GetResults(electionID, viewer, h.Ctx), 'GetResults');
            expect(during.Visible).toBe(false);
            expect(during.Contests ?? []).toHaveLength(0);
        }
        // Turnout is available throughout and never reports results.
        const turnout = Must(await ResultsEngine.Instance.GetTurnout(electionID, h.Ctx), 'GetTurnout');
        expect(turnout.Eligible).toBe(3);
        expect(turnout.Voted).toBe(1);

        Must(await ElectionAdministrationEngine.Instance.CloseElection(electionID, h.Ctx), 'CloseElection');
        const closed = Must(await ResultsEngine.Instance.GetResults(electionID, VOTER, h.Ctx), 'GetResults');
        expect(closed.Visible, 'closed but not tallied').toBe(false);

        Must(await TallyEngine.Instance.Tally(electionID, 'seed', h.Ctx), 'Tally');
        const final = Must(await ResultsEngine.Instance.GetResults(electionID, VOTER, h.Ctx), 'GetResults');
        expect(final.Visible).toBe(true);
        expect(final.IsFinal).toBe(true);
    });

    it('a Live poll with ResultsMinCast 3 shows nothing until a snapshot with at least 3 ballots is published', async () => {
        if (!h) return;
        const voters = await CreatePeople(h, 5, 'live');
        const electionID = await CreateOpenElection(h, {
            Type: 'poll',
            Voters: voters,
            Contests: [QuestionContest('Lunch poll')],
            Overrides: { ResultsTiming: 'Live', ResultsAudience: 'Voters', Configuration: { ResultsMinCast: 3 } },
        });
        const roll = await LoadRoll(h, electionID);
        const engine = ResultsEngine.Instance;

        // Two ballots: below the minimum.
        for (let i = 0; i < 2; i++) expect((await CastVote(h, electionID, roll[i].EligibleVoterID, 0)).Success).toBe(true);
        const early = Must(await engine.PublishSnapshot(electionID, h.Ctx), 'PublishSnapshot');
        expect(early.Published).toBe(false);
        const hiddenEarly = Must(await engine.GetResults(electionID, VOTER, h.Ctx), 'GetResults');
        expect(hiddenEarly.Visible).toBe(false);

        // Third ballot: now the first snapshot is due.
        expect((await CastVote(h, electionID, roll[2].EligibleVoterID, 1)).Success).toBe(true);
        const hiddenUntilPublished = Must(await engine.GetResults(electionID, VOTER, h.Ctx), 'GetResults');
        expect(hiddenUntilPublished.Visible, 'a request never computes from live counts').toBe(false);
        const published = Must(await engine.PublishSnapshot(electionID, h.Ctx), 'PublishSnapshot');
        expect(published.Published).toBe(true);
        expect(published.BallotCount).toBe(3);

        const visible = Must(await engine.GetResults(electionID, VOTER, h.Ctx), 'GetResults');
        expect(visible.Visible).toBe(true);
        expect(visible.IsRunning).toBe(true);
        expect(visible.IsFinal).toBe(false);
        expect(visible.BallotCount).toBe(3);
        const votes = (visible.Contests?.[0].Options ?? []).map((o) => o.Votes).sort();
        expect(votes).toEqual([1, 2]);

        // A fourth ballot does not move what viewers see (batching: never per ballot).
        expect((await CastVote(h, electionID, roll[3].EligibleVoterID, 1)).Success).toBe(true);
        const batched = Must(await engine.PublishSnapshot(electionID, h.Ctx), 'PublishSnapshot');
        expect(batched.Published).toBe(false);
        const unchanged = Must(await engine.GetResults(electionID, VOTER, h.Ctx), 'GetResults');
        expect(unchanged.BallotCount).toBe(3);

        // A viewer outside the audience (not on the roll) sees nothing. (The contract treats the 'Voters' audience as the
        // eligible roll, so an eligible viewer who has not voted yet is in the audience.)
        const outsider = Must(await engine.GetResults(electionID, { ...VOTER, IsEligible: false, HasVoted: false }, h.Ctx), 'GetResults');
        expect(outsider.Visible).toBe(false);
    });

    it('Open mode records attribution for every ballot', async () => {
        if (!h) return;
        const schema = await VotingSchema(h);
        const voters = await CreatePeople(h, 3, 'open');
        const electionID = await CreateOpenElection(h, { Voters: voters, Overrides: { SecrecyMode: 'Open' } });
        const roll = await LoadRoll(h, electionID);
        for (let i = 0; i < 2; i++) expect((await CastVote(h, electionID, roll[i].EligibleVoterID, i)).Success).toBe(true);
        const attributed = await Scalar<number>(
            h,
            `SELECT COUNT(*) FROM [${schema}].[BallotAttribution] ba JOIN [${schema}].[CastBallot] cb ON cb.ID = ba.CastBallotID WHERE cb.ElectionID = @e`,
            { e: electionID }
        );
        expect(attributed).toBe(2);
        // Every attribution joins a ballot to exactly one participation of that election.
        const joined = await Scalar<number>(
            h,
            `SELECT COUNT(*) FROM [${schema}].[BallotAttribution] ba
               JOIN [${schema}].[CastBallot] cb ON cb.ID = ba.CastBallotID
               JOIN [${schema}].[Participation] p ON p.ID = ba.ParticipationID AND p.ElectionID = cb.ElectionID
              WHERE cb.ElectionID = @e`,
            { e: electionID }
        );
        expect(joined).toBe(2);
    });

    it('Confidential mode lets the voter read back their receipt, and a revote supersedes the first ballot', async () => {
        if (!h) return;
        const schema = await VotingSchema(h);
        const voters = await CreatePeople(h, 3, 'conf');
        const electionID = await CreateOpenElection(h, { Voters: voters, Overrides: { SecrecyMode: 'Confidential' } });
        const roll = await LoadRoll(h, electionID);
        const voter = roll[0].EligibleVoterID;

        const first = await CastVote(h, electionID, voter, 0);
        expect(first.Success, `first: ${first.Code}`).toBe(true);
        const mine = Must(await CastEngine.Instance.GetMyParticipation(electionID, voter, h.Ctx), 'GetMyParticipation');
        expect(mine.HasVoted).toBe(true);
        expect(mine.CanRevote).toBe(true);
        expect(mine.ReceiptCode).toBe(first.ReceiptCode);
        const verified = Must(await CastEngine.Instance.VerifyReceipt(electionID, first.ReceiptCode!, h.Ctx), 'VerifyReceipt');
        expect(verified).toEqual({ Found: true, Counted: true });

        // Another voter cannot read this voter's receipt back through their own participation.
        const other = Must(await CastEngine.Instance.GetMyParticipation(electionID, roll[1].EligibleVoterID, h.Ctx), 'GetMyParticipation');
        expect(other.HasVoted).toBe(false);
        expect(other.ReceiptCode).toBeUndefined();

        const second = await CastVote(h, electionID, voter, 1);
        expect(second.Success, `revote: ${second.Code}`).toBe(true);
        expect(second.ReceiptCode).not.toBe(first.ReceiptCode);
        expect(await Scalar<number>(h, `SELECT COUNT(*) FROM [${schema}].[Participation] WHERE ElectionID = @e`, { e: electionID })).toBe(1);
        expect(await Scalar<number>(h, `SELECT COUNT(*) FROM [${schema}].[CastBallot] WHERE ElectionID = @e`, { e: electionID })).toBe(2);
        expect(await Scalar<number>(h, `SELECT COUNT(*) FROM [${schema}].[CastBallot] WHERE ElectionID = @e AND Status = 'Counted'`, { e: electionID })).toBe(1);
        expect(Must(await CastEngine.Instance.VerifyReceipt(electionID, first.ReceiptCode!, h.Ctx), 'VerifyReceipt')).toEqual({ Found: true, Counted: false });
        expect(Must(await CastEngine.Instance.GetMyParticipation(electionID, voter, h.Ctx), 'GetMyParticipation').ReceiptCode).toBe(second.ReceiptCode);
    });
});
