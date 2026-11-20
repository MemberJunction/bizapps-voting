import { describe, expect, it } from 'vitest';
import { ElectionAdministrationEngine, TallyEngine, TrusteeEngine } from '@mj-biz-apps/voting-server';
import { GetHarness } from '../support/harness.js';
import { As, CastVote, CreateDraft, CreatePeople, LoadRoll, Must, Persona, Rows, VotingSchema } from '../support/world.js';

const h = await GetHarness();

describe.skipIf(!h)('7. Tier B (High assurance, trustee key shares)', () => {
    it('3 trustees, k=2: tally fails before shares and succeeds once two verified shares are in', async () => {
        if (!h) return;
        const schema = await VotingSchema(h);
        const voters = await CreatePeople(h, 5, 'tb');
        const trustees = await CreatePeople(h, 3, 'trustee');
        const electionID = await CreateDraft(h, { Voters: voters, Overrides: { SecrecyMode: 'Secret', AssuranceTier: 'HighAssurance' } });

        const keys = Must(
            await TrusteeEngine.Instance.CreateTrusteeKeys({ ElectionID: electionID, TrusteePersonIDs: trustees.map((t) => t.ID), Threshold: 2 }, h.Ctx),
            'CreateTrusteeKeys'
        );
        expect(keys.PublicKey).toContain('BEGIN PUBLIC KEY');
        expect(keys.Shares).toHaveLength(3);
        // Shares are returned once and never stored: nothing in the database equals a share.
        const stored = await Rows<{ PublicShare: string; Commitment: string }>(
            h,
            `SELECT kc.PublicShare, kc.Commitment FROM [${schema}].[TrusteeKeyCommitment] kc JOIN [${schema}].[ElectionTrustee] t ON t.ID = kc.ElectionTrusteeID WHERE t.ElectionID = @e`,
            { e: electionID }
        );
        expect(stored).toHaveLength(3);
        for (const share of keys.Shares) expect(stored.some((s) => s.PublicShare === share.Share || s.Commitment === share.Share)).toBe(false);

        Must(await ElectionAdministrationEngine.Instance.OpenElection(electionID, h.Ctx), 'OpenElection');
        const roll = await LoadRoll(h, electionID);
        for (let i = 0; i < roll.length; i++) {
            const out = await CastVote(h, electionID, roll[i].EligibleVoterID, i < 4 ? 0 : 1);
            expect(out.Success, `cast ${i}: ${out.Code}`).toBe(true);
        }
        const ciphertexts = await Rows<{ Selections: string }>(h, `SELECT Selections FROM [${schema}].[CastBallot] WHERE ElectionID = @e`, { e: electionID });
        expect(ciphertexts).toHaveLength(5);
        for (const c of ciphertexts) expect(c.Selections.startsWith('v1:b:')).toBe(true);

        Must(await ElectionAdministrationEngine.Instance.CloseElection(electionID, h.Ctx), 'CloseElection');

        const early = await TallyEngine.Instance.Tally(electionID, 'seed', h.Ctx);
        expect(early.Success, 'tally before any share').toBe(false);

        // Trustees submit through their own identity (the engine matches the acting user to the trustee's person).
        const submit = async (index: number) =>
            TrusteeEngine.Instance.SubmitKeyShare(
                { ElectionID: electionID, ShareIndex: keys.Shares[index].ShareIndex, Share: keys.Shares[index].Share },
                As(h, Persona(h.System, trustees[index].Email))
            );

        const wrongTrustee = await TrusteeEngine.Instance.SubmitKeyShare(
            { ElectionID: electionID, ShareIndex: keys.Shares[0].ShareIndex, Share: keys.Shares[0].Share },
            As(h, Persona(h.System, trustees[1].Email))
        );
        expect(wrongTrustee.Success, 'a trustee cannot submit another trustee\'s share').toBe(false);

        const one = Must(await submit(0), 'first share');
        expect(one.SharesReceived).toBe(1);
        expect(one.KeyReady).toBe(false);
        expect((await TallyEngine.Instance.Tally(electionID, 'seed', h.Ctx)).Success, 'tally with 1 of 2 shares').toBe(false);

        const two = Must(await submit(2), 'second share');
        expect(two.SharesReceived).toBe(2);
        expect(two.KeyReady).toBe(true);

        const tally = Must(await TallyEngine.Instance.Tally(electionID, 'seed', h.Ctx), 'Tally');
        expect(tally.Status).toBe('Tallied');
        expect(tally.BallotsCounted).toBe(5);
        expect(tally.Contests[0].Outcome).toBe('Passed');
        expect(tally.Contests[0].VotesCast).toBe(5);
        // Key material is wiped after the tally.
        expect(TrusteeEngine.Instance.GetReconstructedKey(electionID)).toBeNull();
    });
});
