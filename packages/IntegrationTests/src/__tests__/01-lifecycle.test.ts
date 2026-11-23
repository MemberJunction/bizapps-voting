import { describe, expect, it } from 'vitest';
import { CertificationEngine, ElectionAdministrationEngine, ResultsEngine, TallyEngine, VoterRollEngine } from '@mj-biz-apps/voting-server';
import { GetHarness } from '../support/harness.js';
import { As, CastVote, CreateDraft, CreatePeople, CreatePerson, LoadElection, LoadRoll, MotionContest, Must, Persona, Rows, VotingSchema } from '../support/world.js';

const h = await GetHarness();

describe.skipIf(!h)('1. Election lifecycle (motion, CSV roll of 6)', () => {
    it('create -> freeze -> open -> 6 casts -> close -> tally -> certify', async () => {
        if (!h) return;
        const voters = await CreatePeople(h, 6, 'life');
        const electionID = await CreateDraft(h, { Type: 'motion', Voters: voters, Contests: [MotionContest()], Overrides: { SecrecyMode: 'Secret' } });

        let election = await LoadElection(h, electionID);
        expect(election.Status).toBe('Draft');
        expect(election.RollFrozenAt).toBeNull();

        const frozen = Must(await VoterRollEngine.Instance.FreezeRoll(electionID, h.Ctx), 'FreezeRoll');
        expect(frozen.VoterCount).toBe(6);
        expect(frozen.RollHash).toMatch(/^[0-9a-f]{64}$/);
        election = await LoadElection(h, electionID);
        expect(election.RollFrozenAt).not.toBeNull();
        expect(election.RollHash).toBe(frozen.RollHash);

        Must(await ElectionAdministrationEngine.Instance.OpenElection(electionID, h.Ctx), 'OpenElection');
        expect((await LoadElection(h, electionID)).Status).toBe('Open');

        const roll = await LoadRoll(h, electionID);
        expect(roll).toHaveLength(6);
        // 4 Yes (option 0), 2 No (option 1)
        const receipts: string[] = [];
        for (let i = 0; i < roll.length; i++) {
            const out = await CastVote(h, electionID, roll[i].EligibleVoterID, i < 4 ? 0 : 1);
            expect(out.Success, `cast ${i}: ${out.Code}`).toBe(true);
            expect(out.ReceiptCode).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){4}$/);
            receipts.push(out.ReceiptCode!);
        }
        expect(new Set(receipts).size).toBe(6);

        Must(await ElectionAdministrationEngine.Instance.CloseElection(electionID, h.Ctx), 'CloseElection');
        expect((await LoadElection(h, electionID)).Status).toBe('Closed');

        const tally = Must(await TallyEngine.Instance.Tally(electionID, 'it-seed', h.Ctx), 'Tally');
        expect(tally.Status).toBe('Tallied');
        expect(tally.BallotsCounted).toBe(6);
        expect(tally.Contests).toHaveLength(1);
        const contest = tally.Contests[0];
        expect(contest.Outcome).toBe('Passed');
        expect(contest.VotesCast).toBe(6);
        expect(contest.Abstentions).toBe(0);
        const yes = contest.Options.find((o) => o.Votes === 4);
        const no = contest.Options.find((o) => o.Votes === 2);
        expect(yes).toBeDefined();
        expect(no).toBeDefined();

        // Certification is signed by a Person; the acting administrator is a persona with a person of its own.
        const certifierPerson = await CreatePerson(h, 'certifier');
        const certifier = As(h, Persona(h.System, certifierPerson.Email));
        const cert = Must(await CertificationEngine.Instance.Certify(electionID, 'integration test', certifier), 'Certify');
        expect(cert.Status).toBe('Certified');
        expect(cert.SignaturesReceived).toBe(1);
        expect((await LoadElection(h, electionID)).Status).toBe('Certified');

        const [row] = await Rows<{ RollHash: string; BallotSetHash: string; ResultsTimingDisclosure: string; Status: string }>(
            h,
            `SELECT RollHash, BallotSetHash, ResultsTimingDisclosure, Status FROM [${await schema()}].[ElectionCertification] WHERE ElectionID = @id`,
            { id: electionID }
        );
        expect(row.Status).toBe('Certified');
        expect(row.RollHash).toBe(frozen.RollHash);
        expect(row.BallotSetHash).toMatch(/^[0-9a-f]{64}$/);
        expect(row.ResultsTimingDisclosure.length).toBeGreaterThan(10);

        const results = Must(await ResultsEngine.Instance.GetResults(electionID, { IsAdministrator: false, IsEligible: true, HasVoted: true, IsHostMember: false }, h.Ctx), 'GetResults');
        expect(results.Visible).toBe(true);
        expect(results.IsFinal).toBe(true);
        expect(results.Contests?.[0].Outcome).toBe('Passed');

        // An administrator who is not on the roll sees the final results too, whatever the audience.
        const admin = Must(await ResultsEngine.Instance.GetResults(electionID, { IsAdministrator: true, IsEligible: false, HasVoted: false, IsHostMember: false }, h.Ctx), 'GetResults (admin)');
        expect(admin.Visible).toBe(true);
        expect(admin.IsFinal).toBe(true);
        expect(admin.Contests?.[0].Outcome).toBe('Passed');
        // A non-administrator outside the audience still sees nothing.
        const outsider = Must(await ResultsEngine.Instance.GetResults(electionID, { IsAdministrator: false, IsEligible: false, HasVoted: false, IsHostMember: false }, h.Ctx), 'GetResults (outsider)');
        expect(outsider.Visible).toBe(false);
    });
});

function schema(): Promise<string> {
    return VotingSchema(h!);
}
