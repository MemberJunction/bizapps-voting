import { describe, expect, it } from 'vitest';
import { BallotStyleBuilder, CastEngine, CredentialEngine, LoadElectionGraph, VoterRollEngine } from '@mj-biz-apps/voting-server';
import { GetHarness } from '../support/harness.js';
import { CastVote, CreateOpenElection, CreatePeople, LoadRoll, Must, PickOption, Rows, VotingSchema } from '../support/world.js';

const h = await GetHarness();

describe.skipIf(!h)('8. Paper ballots', () => {
    it('a control number identifies the voter, a Paper cast records the channel, and a later online cast is refused', async () => {
        if (!h) return;
        const schema = await VotingSchema(h);
        const voters = await CreatePeople(h, 3, 'paper');
        const electionID = await CreateOpenElection(h, { Voters: voters, Overrides: { SecrecyMode: 'Secret' } });
        const roll = await LoadRoll(h, electionID);
        const target = roll[0].EligibleVoterID;

        const issued = Must(await CredentialEngine.Instance.IssueControlNumbers({ ElectionID: electionID, EligibleVoterIDs: [target] }, h.Ctx), 'IssueControlNumbers');
        expect(issued.Numbers).toHaveLength(1);
        const controlNumber = issued.Numbers[0].ControlNumber;

        // Identify without consuming (what the EnterPaperBallot operation does first).
        const identified = Must(await CredentialEngine.Instance.VerifyControlNumber(electionID, controlNumber, h.Ctx, false), 'VerifyControlNumber');
        expect(identified.EligibleVoterID).toBe(target);

        const graph = Must(await LoadElectionGraph(electionID, h.Ctx), 'LoadElectionGraph');
        const voter = Must(await VoterRollEngine.Instance.GetVoter(target, h.Ctx), 'GetVoter');
        const style = await BallotStyleBuilder.Instance.Build(graph, voter.VotingClass, 'en', h.Ctx);
        const paper = await CastEngine.Instance.Cast(
            { ElectionID: electionID, EligibleVoterID: target, BallotStyleHash: style.Hash, Submission: PickOption(style, 0), Channel: 'Paper', EnteredByUserID: h.System.ID },
            h.Ctx
        );
        expect(paper.Success, 'paper cast').toBe(true);

        Must(await CredentialEngine.Instance.VerifyControlNumber(electionID, controlNumber, h.Ctx, true), 'redeem control number');
        const reuse = await CredentialEngine.Instance.VerifyControlNumber(electionID, controlNumber, h.Ctx, false);
        expect(reuse.Success, 'a redeemed control number cannot be used again').toBe(false);

        const [row] = await Rows<{ Channel: string; EnteredByUserID: string | null }>(
            h,
            `SELECT Channel, EnteredByUserID FROM [${schema}].[Participation] WHERE ElectionID = @e AND EligibleVoterID = @v`,
            { e: electionID, v: target }
        );
        expect(row.Channel).toBe('Paper');
        expect(row.EnteredByUserID?.toLowerCase()).toBe(h.System.ID.toLowerCase());

        // The same voter then tries online: the poll book already has them.
        const online = await CastVote(h, electionID, target, 1);
        expect(online.Success).toBe(false);
        expect(online.Code).toBe('AlreadyVoted');

        // Exactly one participation and one ballot for them, and a different voter can still vote online.
        const ballots = await Rows<{ N: number }>(h, `SELECT COUNT(*) AS N FROM [${schema}].[CastBallot] WHERE ElectionID = @e`, { e: electionID });
        expect(ballots[0].N).toBe(1);
        expect((await CastVote(h, electionID, roll[1].EligibleVoterID, 0)).Success).toBe(true);
    });
});
