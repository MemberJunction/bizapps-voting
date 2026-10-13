import { describe, expect, it } from 'vitest';
import { type BallotStyle, type VotingBallotSubmission, type VotingContestSpec, type mjBizAppsVotingStandardsBallotElectionEntity } from '@mj-biz-apps/voting-entities';
import { CastEngine, CertificationEngine, CommentEngine, ElectionAdministrationEngine, TallyEngine, VoterRollEngine } from '@mj-biz-apps/voting-server';
import { GetHarness, type Harness } from '../support/harness.js';
import { As, CreateDraft, CreatePeople, CreatePerson, LoadElection, LoadRoll, Must, Persona, Rows, StyleFor, TrySave, VotingSchema } from '../support/world.js';

const h = await GetHarness();

const EXTENSION_ENTITY = 'MJ_BizApps_Voting: Standards Ballot Elections';

function Item(name: string): VotingContestSpec {
    return { Name: name, Kind: 'StandardsItem', TallyMethodCode: 'majority', Threshold: 'Majority', AllowAbstain: true, Options: [{ Label: 'Approve' }, { Label: 'Disapprove' }] };
}

/**
 * Creates (or updates) the IS-A child row of an existing standards election. The child shares its parent's primary key
 * (the parent's ID is the child's ID): EnsureISAChild on the saved parent returns the child entity bound to that key
 * (it reads the row when present and otherwise gives a blank child carrying the parent's key), and saving the child
 * writes only the extension table because the parent is untouched.
 */
async function SaveExtension(
    harness: Harness,
    electionID: string,
    values: { DocumentTitle: string; RecirculationRound?: number; PriorElectionID?: string }
): Promise<{ Saved: boolean; Message: string }> {
    const election = await LoadElection(harness, electionID);
    const child = (await election.EnsureISAChild(EXTENSION_ENTITY)) as mjBizAppsVotingStandardsBallotElectionEntity | null;
    if (!child) throw new Error('EnsureISAChild returned no child');
    child.DocumentTitle = values.DocumentTitle;
    if (values.RecirculationRound !== undefined) child.RecirculationRound = values.RecirculationRound;
    if (values.PriorElectionID !== undefined) child.PriorElectionID = values.PriorElectionID;
    return TrySave(child);
}

async function CreateStandards(harness: Harness, voters: Awaited<ReturnType<typeof CreatePeople>>, overrides: { SecrecyMode?: 'Open' | 'Secret' } = {}): Promise<string> {
    return CreateDraft(harness, {
        Type: 'standards-ballot',
        Voters: voters,
        Contests: [Item('Clause 4.1'), Item('Clause 7.3')],
        Overrides: { SecrecyMode: overrides.SecrecyMode ?? 'Open' },
    });
}

/** A submission choosing Approve (index 0) or Disapprove (1) per contest, with optional comments on the Disapprove. */
function Submission(style: BallotStyle, picks: number[], comment?: string): VotingBallotSubmission {
    return {
        Contests: style.Contests.map((c, i) => ({
            ContestID: c.ContestID,
            Selections: [{ OptionID: c.Options[picks[i]].OptionID }],
            ...(picks[i] === 1 && comment ? { Comments: [{ CommentType: 'Technical' as const, DocumentReference: 'Clause 4.1', Comment: comment, ProposedChange: 'Reword.' }] } : {}),
        })),
    };
}

async function CastSubmission(harness: Harness, electionID: string, eligibleVoterID: string, picks: number[], comment?: string) {
    const style = await StyleFor(harness, electionID, eligibleVoterID);
    return CastEngine.Instance.Cast(
        { ElectionID: electionID, EligibleVoterID: eligibleVoterID, BallotStyleHash: style.Hash, Submission: Submission(style, picks, comment), Channel: 'Online' },
        harness.Ctx
    );
}

describe.skipIf(!h)('10. Standards ballot (Open roll call, Approve / Disapprove items)', () => {
    it('creates without the extension row, refuses to open until it exists, then runs end to end', async () => {
        if (!h) return;
        const schema = await VotingSchema(h);
        const voters = await CreatePeople(h, 2, 'std');
        const electionID = await CreateStandards(h, voters);
        expect((await LoadElection(h, electionID)).Status).toBe('Draft');

        Must(await VoterRollEngine.Instance.FreezeRoll(electionID, h.Ctx), 'FreezeRoll');
        const refused = await ElectionAdministrationEngine.Instance.OpenElection(electionID, h.Ctx);
        expect(refused.Success).toBe(false);
        expect((refused as { ErrorMessage: string }).ErrorMessage).toMatch(/Standards Ballot details|document title/i);
        expect((await LoadElection(h, electionID)).Status).not.toBe('Open');

        const saved = await SaveExtension(h, electionID, { DocumentTitle: `IT Standard ${electionID.slice(0, 8)}` });
        expect(saved.Saved, saved.Message).toBe(true);
        const [ext] = await Rows<{ N: number }>(h, `SELECT COUNT(*) AS N FROM [${schema}].[StandardsBallotElection] WHERE ID = @id`, { id: electionID });
        expect(ext.N).toBe(1);

        Must(await ElectionAdministrationEngine.Instance.OpenElection(electionID, h.Ctx), 'OpenElection');
        expect((await LoadElection(h, electionID)).Status).toBe('Open');

        const roll = await LoadRoll(h, electionID);
        expect(roll).toHaveLength(2);
        const [a, b] = roll;

        // A Disapprove with no comment is refused, and nothing is written.
        const countsBefore = await Rows<{ Casts: number; Comments: number; Attr: number }>(
            h,
            `SELECT (SELECT COUNT(*) FROM [${schema}].[CastBallot] WHERE ElectionID = @id) AS Casts,
                    (SELECT COUNT(*) FROM [${schema}].[BallotComment] bc JOIN [${schema}].[Contest] c ON c.ID = bc.ContestID WHERE c.ElectionID = @id) AS Comments,
                    (SELECT COUNT(*) FROM [${schema}].[BallotAttribution] ba JOIN [${schema}].[CastBallot] cb ON cb.ID = ba.CastBallotID WHERE cb.ElectionID = @id) AS Attr`,
            { id: electionID }
        );
        const noComment = await CastSubmission(h, electionID, a.EligibleVoterID, [1, 0]);
        expect(noComment.Success).toBe(false);
        const countsAfterRefusal = await Rows<{ Casts: number; Comments: number; Attr: number }>(
            h,
            `SELECT (SELECT COUNT(*) FROM [${schema}].[CastBallot] WHERE ElectionID = @id) AS Casts,
                    (SELECT COUNT(*) FROM [${schema}].[BallotComment] bc JOIN [${schema}].[Contest] c ON c.ID = bc.ContestID WHERE c.ElectionID = @id) AS Comments,
                    (SELECT COUNT(*) FROM [${schema}].[BallotAttribution] ba JOIN [${schema}].[CastBallot] cb ON cb.ID = ba.CastBallotID WHERE cb.ElectionID = @id) AS Attr`,
            { id: electionID }
        );
        expect(countsAfterRefusal[0]).toEqual(countsBefore[0]);
        expect(countsAfterRefusal[0]).toEqual({ Casts: 0, Comments: 0, Attr: 0 });

        // Disapprove with a comment, and a plain Approve, succeed.
        const castA = await CastSubmission(h, electionID, a.EligibleVoterID, [1, 0], 'Clause 4.1 is ambiguous about scope.');
        expect(castA.Success, JSON.stringify(castA)).toBe(true);
        const castB = await CastSubmission(h, electionID, b.EligibleVoterID, [0, 0]);
        expect(castB.Success, JSON.stringify(castB)).toBe(true);

        const comments = await Rows<{ ID: string; ParticipationID: string; EligibleVoterID: string; Comment: string; CommentType: string }>(
            h,
            `SELECT bc.ID, bc.ParticipationID, p.EligibleVoterID, bc.Comment, bc.CommentType
               FROM [${schema}].[BallotComment] bc
               JOIN [${schema}].[Contest] c ON c.ID = bc.ContestID
               JOIN [${schema}].[Participation] p ON p.ID = bc.ParticipationID
              WHERE c.ElectionID = @id`,
            { id: electionID }
        );
        expect(comments).toHaveLength(1);
        expect(comments[0].EligibleVoterID.toLowerCase()).toBe(a.EligibleVoterID.toLowerCase());
        expect(comments[0].Comment).toContain('ambiguous');
        expect(comments[0].CommentType).toBe('Technical');

        // Open secrecy: each cast ballot is attributed to its voter's participation.
        const attributions = await Rows<{ EligibleVoterID: string }>(
            h,
            `SELECT p.EligibleVoterID FROM [${schema}].[BallotAttribution] ba
               JOIN [${schema}].[CastBallot] cb ON cb.ID = ba.CastBallotID
               JOIN [${schema}].[Participation] p ON p.ID = ba.ParticipationID
              WHERE cb.ElectionID = @id`,
            { id: electionID }
        );
        expect(attributions).toHaveLength(2);
        expect(new Set(attributions.map((r) => r.EligibleVoterID.toLowerCase()))).toEqual(new Set([a.EligibleVoterID.toLowerCase(), b.EligibleVoterID.toLowerCase()]));

        Must(await ElectionAdministrationEngine.Instance.CloseElection(electionID, h.Ctx), 'CloseElection');
        const tally = Must(await TallyEngine.Instance.Tally(electionID, 'it-seed', h.Ctx), 'Tally');
        expect(tally.Status).toBe('Tallied');
        expect(tally.BallotsCounted).toBe(2);
        expect(tally.Contests).toHaveLength(2);

        const resolved = Must(await CommentEngine.Instance.ResolveComment({ BallotCommentID: comments[0].ID, Disposition: 'Accepted', Response: 'Reworded in the next draft.' }, h.Ctx), 'ResolveComment');
        const [resolution] = await Rows<{ Disposition: string }>(h, `SELECT Disposition FROM [${schema}].[CommentResolution] WHERE ID = @id`, { id: resolved.CommentResolutionID });
        expect(resolution.Disposition).toBe('Accepted');

        const certifierPerson = await CreatePerson(h, 'std-certifier');
        const cert = Must(await CertificationEngine.Instance.Certify(electionID, 'integration test', As(h, Persona(h.System, certifierPerson.Email))), 'Certify');
        expect(cert.Status).toBe('Certified');
        expect((await LoadElection(h, electionID)).Status).toBe('Certified');
    });

    it('refuses a standards ballot that is not Open secrecy', async () => {
        if (!h) return;
        const voters = await CreatePeople(h, 1, 'std-secret');
        await expect(CreateStandards(h, voters, { SecrecyMode: 'Secret' })).rejects.toThrow(/roll call|Open/i);
    });

    it('refuses a recirculation whose prior ballot is not Certified', async () => {
        if (!h) return;
        const voters = await CreatePeople(h, 1, 'std-recirc');
        const prior = await CreateStandards(h, voters);
        const title = `IT Recirc ${prior.slice(0, 8)}`;
        const priorSaved = await SaveExtension(h, prior, { DocumentTitle: title });
        expect(priorSaved.Saved, priorSaved.Message).toBe(true);

        const follow = await CreateStandards(h, voters);
        const saved = await SaveExtension(h, follow, { DocumentTitle: title, RecirculationRound: 1, PriorElectionID: prior });
        if (saved.Saved) {
            // The extension row itself may save; the ballot must still not open while the prior is not Certified.
            // Election state changes re-run the driver's checks; the first one to touch the election (freezing the roll, which
            // saves it) refuses, and the election never opens.
            const freeze = await VoterRollEngine.Instance.FreezeRoll(follow, h.Ctx);
            const open = freeze.Success ? await ElectionAdministrationEngine.Instance.OpenElection(follow, h.Ctx) : freeze;
            expect(open.Success).toBe(false);
            expect((open as { ErrorMessage: string }).ErrorMessage).toMatch(/Certified/);
            expect((await LoadElection(h, follow)).Status).not.toBe('Open');
        } else {
            expect(saved.Message).toMatch(/Certified/);
        }
    });
});
