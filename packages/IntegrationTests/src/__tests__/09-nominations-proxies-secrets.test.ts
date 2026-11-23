import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
    type mjBizAppsVotingBallotDistributionEntity,
    type mjBizAppsVotingContestOptionEntity,
    type mjBizAppsVotingElectionEntity,
    type mjBizAppsVotingNominationEntity,
    type mjBizAppsVotingProxyDesignationEntity,
    type VotingEnterPaperBallotInput,
} from '@mj-biz-apps/voting-entities';
import {
    BallotStyleBuilder,
    CastEngine,
    CredentialEngine,
    ElectionAdministrationEngine,
    LoadElectionGraph,
    NominationEngine,
    VoterRollEngine,
} from '@mj-biz-apps/voting-server';
import { BaseRemotableOperation } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { GetHarness } from '../support/harness.js';
import {
    CreateDraft,
    CreatePeople,
    CreatePerson,
    LoadElection,
    LoadRoll,
    Must,
    PickOption,
    RUN_TAG,
    Rows,
    TrySave,
    VotingSchema,
} from '../support/world.js';

const h = await GetHarness();

/** What the test needs of the operation: its protected execute step, called directly (authorization is covered by unit tests). */
interface EnterPaperBallotRunner {
    InternalExecute(input: VotingEnterPaperBallotInput, provider: unknown, user: unknown): Promise<{ Success: boolean; Message?: string; ReceiptCode?: string }>;
}

const OFFICE = (name = 'Chair') => ({ Name: name, Kind: 'Office' as const, TallyMethodCode: 'plurality', Seats: 1, Options: [] });

describe.skipIf(!h)('9. Nominations, proxies, control numbers and PINs', () => {
    it('nominations: open -> submit -> approve creates an option -> close -> open the election', async () => {
        if (!h) return;
        const voters = await CreatePeople(h, 3, 'nom');
        const nominee = await CreatePerson(h, 'nominee');
        const rejected = await CreatePerson(h, 'rejected');
        const electionID = await CreateDraft(h, { Type: 'board-election', Voters: voters, Contests: [OFFICE()] });
        const graph = Must(await LoadElectionGraph(electionID, h.Ctx), 'LoadElectionGraph');
        const contestID = graph.Contests[0].ID;

        // Not accepting nominations until opened.
        const early = await NominationEngine.Instance.SubmitNomination({ ContestID: contestID, NomineePersonID: nominee.ID }, null, h.Ctx);
        expect(early.Success).toBe(false);

        expect(Must(await ElectionAdministrationEngine.Instance.OpenNominations(electionID, h.Ctx), 'OpenNominations').Status).toBe('Nominations');
        expect((await LoadElection(h, electionID)).Status).toBe('Nominations');
        // Opening twice is an invalid transition.
        expect((await ElectionAdministrationEngine.Instance.OpenNominations(electionID, h.Ctx)).Success).toBe(false);

        const a = Must(await NominationEngine.Instance.SubmitNomination({ ContestID: contestID, NomineePersonID: nominee.ID, Statement: 'I will serve.' }, null, h.Ctx), 'SubmitNomination');
        const b = Must(await NominationEngine.Instance.SubmitNomination({ ContestID: contestID, NomineePersonID: rejected.ID }, null, h.Ctx), 'SubmitNomination 2');

        const approved = Must(await NominationEngine.Instance.DecideNomination({ NominationID: a.NominationID, Decision: 'Approved' }, h.Ctx), 'Approve');
        expect(approved.Status).toBe('Approved');
        expect(approved.ContestOptionID).toBeTruthy();
        const declined = Must(await NominationEngine.Instance.DecideNomination({ NominationID: b.NominationID, Decision: 'Rejected', Notes: 'Not a member' }, h.Ctx), 'Reject');
        expect(declined.ContestOptionID).toBeUndefined();

        const options = await h.Provider.RunView<mjBizAppsVotingContestOptionEntity>(
            { EntityName: 'MJ_BizApps_Voting: Contest Options', ExtraFilter: `ContestID = '${contestID}'`, ResultType: 'entity_object' },
            h.System
        );
        expect(options.Results).toHaveLength(1);
        expect(options.Results[0].CandidatePersonID?.toLowerCase()).toBe(nominee.ID.toLowerCase());
        const nomination = await h.Provider.GetEntityObject<mjBizAppsVotingNominationEntity>('MJ_BizApps_Voting: Nominations', h.System);
        await nomination.Load(a.NominationID);
        expect(nomination.ContestOptionID?.toLowerCase()).toBe(options.Results[0].ID.toLowerCase());

        expect(Must(await ElectionAdministrationEngine.Instance.CloseNominations(electionID, h.Ctx), 'CloseNominations').Status).toBe('Ready');
        // Closing again is refused: nominations are no longer open.
        expect((await ElectionAdministrationEngine.Instance.CloseNominations(electionID, h.Ctx)).Success).toBe(false);

        expect(Must(await ElectionAdministrationEngine.Instance.OpenElection(electionID, h.Ctx), 'OpenElection').Status).toBe('Open');
    });

    it('nominations cannot open for a closed window or an election with no office contest', async () => {
        if (!h) return;
        const voters = await CreatePeople(h, 2, 'nomwin');
        const withOffice = await CreateDraft(h, { Type: 'board-election', Voters: voters, Contests: [OFFICE()] });
        const election = await LoadElection(h, withOffice);
        election.NominationsOpenAt = new Date(Date.now() - 3 * 86_400_000);
        election.NominationsCloseAt = new Date(Date.now() - 86_400_000);
        expect((await TrySave(election)).Saved).toBe(true);
        const closedWindow = await ElectionAdministrationEngine.Instance.OpenNominations(withOffice, h.Ctx);
        expect(closedWindow.Success).toBe(false);
        expect(JSON.stringify(closedWindow)).toMatch(/already closed/);
        expect((await LoadElection(h, withOffice)).Status).toBe('Draft');

        const motionOnly = await CreateDraft(h, { Voters: voters });
        const noOffice = await ElectionAdministrationEngine.Instance.OpenNominations(motionOnly, h.Ctx);
        expect(noOffice.Success).toBe(false);
        expect(JSON.stringify(noOffice)).toMatch(/office contest/);
    });

    it('proxies: accept a designation, enter a paper proxy ballot, the designation is Used in the same transaction', async () => {
        if (!h) return;
        const schema = await VotingSchema(h);
        const voters = await CreatePeople(h, 4, 'proxy');
        const proxyPerson = await CreatePerson(h, 'proxyholder');
        const electionID = await CreateDraft(h, { Voters: voters });
        const draft: mjBizAppsVotingElectionEntity = await LoadElection(h, electionID);
        draft.ProxyDeadline = new Date(Date.now() + 7 * 86_400_000);
        expect((await TrySave(draft)).Saved).toBe(true);
        Must(await VoterRollEngine.Instance.FreezeRoll(electionID, h.Ctx), 'FreezeRoll');
        Must(await ElectionAdministrationEngine.Instance.OpenElection(electionID, h.Ctx), 'OpenElection');

        const roll = await LoadRoll(h, electionID);
        const grantor = roll[0].EligibleVoterID;
        const other = roll[1].EligibleVoterID;
        const designation = Must(
            await VoterRollEngine.Instance.SubmitProxy(
                { ElectionID: electionID, ProxyPersonID: proxyPerson.ID },
                { ElectionID: electionID, EligibleVoterID: grantor, Via: 'MJSession', CredentialMethodCode: 'mj-session' },
                h.Ctx
            ),
            'SubmitProxy'
        ).ProxyDesignationID;

        const issued = Must(await CredentialEngine.Instance.IssueControlNumbers({ ElectionID: electionID, EligibleVoterIDs: [grantor] }, h.Ctx), 'IssueControlNumbers');
        const controlNumber = issued.Numbers[0].ControlNumber;
        const graph = Must(await LoadElectionGraph(electionID, h.Ctx), 'LoadElectionGraph');
        const voter = Must(await VoterRollEngine.Instance.GetVoter(grantor, h.Ctx), 'GetVoter');
        const style = await BallotStyleBuilder.Instance.Build(graph, voter.VotingClass, 'en', h.Ctx);
        const submission = PickOption(style, 0);
        // The registered operation, resolved the way the server resolves it by key.
        const op = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRemotableOperation>(BaseRemotableOperation, 'Voting.EnterPaperBallot');
        if (!op) throw new Error('Voting.EnterPaperBallot is not registered');
        const enter = (over: Partial<VotingEnterPaperBallotInput>) =>
            (op as unknown as EnterPaperBallotRunner)['InternalExecute']({ ElectionID: electionID, ControlNumber: controlNumber, Submission: submission, Channel: 'Proxy', ProxyDesignationID: designation, ...over }, h.Provider, h.System);

        // Still Pending: refused, and the control number stays usable.
        const pending = await enter({});
        expect(pending.Success).toBe(false);
        expect(pending.Message).toMatch(/Accepted/);
        // A proxy ballot must name its designation; other channels must not.
        expect((await enter({ ProxyDesignationID: undefined })).Success).toBe(false);
        expect((await enter({ Channel: 'Paper' })).Success).toBe(false);

        // Decide: only once.
        expect(Must(await VoterRollEngine.Instance.DecideProxy({ ProxyDesignationID: designation, Decision: 'Accepted', Notes: 'Verified' }, h.Ctx), 'DecideProxy').Status).toBe('Accepted');
        const again = await VoterRollEngine.Instance.DecideProxy({ ProxyDesignationID: designation, Decision: 'Rejected' }, h.Ctx);
        expect(again.Success).toBe(false);

        // A designation never backs another voter's ballot.
        const otherStyle = await BallotStyleBuilder.Instance.Build(graph, (await VoterRollEngine.Instance.GetVoter(other, h.Ctx)).Success ? voter.VotingClass : null, 'en', h.Ctx);
        const wrongVoter = await CastEngine.Instance.Cast(
            { ElectionID: electionID, EligibleVoterID: other, BallotStyleHash: otherStyle.Hash, Submission: PickOption(otherStyle, 0), Channel: 'Proxy', ProxyDesignationID: designation },
            h.Ctx
        );
        expect(wrongVoter.Success).toBe(false);
        expect((wrongVoter as { Code: string }).Code).toBe('ProxyMismatch');

        // A cast that fails validation rolls back: the designation is still Accepted.
        const badHash = await CastEngine.Instance.Cast(
            { ElectionID: electionID, EligibleVoterID: grantor, BallotStyleHash: 'not-the-hash', Submission: submission, Channel: 'Proxy', ProxyDesignationID: designation },
            h.Ctx
        );
        expect(badHash.Success).toBe(false);
        const stillAccepted = await h.Provider.GetEntityObject<mjBizAppsVotingProxyDesignationEntity>('MJ_BizApps_Voting: Proxy Designations', h.System);
        await stillAccepted.Load(designation);
        expect(stillAccepted.Status).toBe('Accepted');

        const done = await enter({});
        expect(done.Success, done.Message).toBe(true);
        expect(done.ReceiptCode).toBeTruthy();
        const used = await h.Provider.GetEntityObject<mjBizAppsVotingProxyDesignationEntity>('MJ_BizApps_Voting: Proxy Designations', h.System);
        await used.Load(designation);
        expect(used.Status).toBe('Used');

        const [part] = await Rows<{ Channel: string; ProxyDesignationID: string | null; EnteredByUserID: string | null }>(
            h,
            `SELECT Channel, ProxyDesignationID, EnteredByUserID FROM [${schema}].[Participation] WHERE ElectionID = @e AND EligibleVoterID = @v`,
            { e: electionID, v: grantor }
        );
        expect(part.Channel).toBe('Proxy');
        expect(part.ProxyDesignationID?.toLowerCase()).toBe(designation.toLowerCase());

        // Burned: the control number cannot enter a second ballot, and the Used designation cannot be decided again.
        expect((await enter({})).Success).toBe(false);
        expect((await VoterRollEngine.Instance.DecideProxy({ ProxyDesignationID: designation, Decision: 'Accepted' }, h.Ctx)).Success).toBe(false);
    });

    it('proxies cannot be decided once the election has closed', async () => {
        if (!h) return;
        const voters = await CreatePeople(h, 3, 'proxyclosed');
        const proxyPerson = await CreatePerson(h, 'holder');
        const electionID = await CreateDraft(h, { Voters: voters });
        const draft = await LoadElection(h, electionID);
        draft.ProxyDeadline = new Date(Date.now() + 7 * 86_400_000);
        expect((await TrySave(draft)).Saved).toBe(true);
        Must(await VoterRollEngine.Instance.FreezeRoll(electionID, h.Ctx), 'FreezeRoll');
        Must(await ElectionAdministrationEngine.Instance.OpenElection(electionID, h.Ctx), 'OpenElection');
        const roll = await LoadRoll(h, electionID);
        const designation = Must(
            await VoterRollEngine.Instance.SubmitProxy(
                { ElectionID: electionID, ProxyPersonID: proxyPerson.ID },
                { ElectionID: electionID, EligibleVoterID: roll[0].EligibleVoterID, Via: 'MJSession', CredentialMethodCode: 'mj-session' },
                h.Ctx
            ),
            'SubmitProxy'
        ).ProxyDesignationID;
        Must(await ElectionAdministrationEngine.Instance.CloseElection(electionID, h.Ctx), 'CloseElection');
        const late = await VoterRollEngine.Instance.DecideProxy({ ProxyDesignationID: designation, Decision: 'Accepted' }, h.Ctx);
        expect(late.Success).toBe(false);
        expect((late as { Code: string }).Code).toBe('InvalidStatus');
    });

    it('control numbers and PINs are returned once and stored only as hashes; the PIN verifies as a second factor', async () => {
        if (!h) return;
        const schema = await VotingSchema(h);
        const voters = await CreatePeople(h, 3, 'pin');
        const electionID = await CreateDraft(h, { Voters: voters });

        // Not issuable before the election is Ready/Open.
        const early = await CredentialEngine.Instance.IssueSecondFactorPins({ ElectionID: electionID }, h.Ctx);
        expect(early.Success).toBe(false);

        Must(await VoterRollEngine.Instance.FreezeRoll(electionID, h.Ctx), 'FreezeRoll');
        const distribution = await h.Provider.GetEntityObject<mjBizAppsVotingBallotDistributionEntity>('MJ_BizApps_Voting: Ballot Distributions', h.System);
        distribution.NewRecord();
        distribution.ElectionID = electionID;
        distribution.Name = `IT ${RUN_TAG} pin`;
        distribution.Slug = `it-${RUN_TAG}-${randomBytes(3).toString('hex')}`;
        distribution.DistributionKey = `key_${RUN_TAG}_${randomBytes(4).toString('hex')}`;
        distribution.Status = 'Active';
        distribution.AllowedCredentialMethods = JSON.stringify(['second-factor']);
        expect((await TrySave(distribution)).Saved).toBe(true);
        Must(await ElectionAdministrationEngine.Instance.OpenElection(electionID, h.Ctx), 'OpenElection');

        const roll = await LoadRoll(h, electionID);
        const target = roll[0].EligibleVoterID;
        const issued = Must(await CredentialEngine.Instance.IssueSecondFactorPins({ ElectionID: electionID, EligibleVoterIDs: [target, '00000000-0000-0000-0000-000000000000'] }, h.Ctx), 'IssueSecondFactorPins');
        expect(issued.Pins).toHaveLength(1);
        expect(issued.Skipped).toBe(1);
        const { Pin: pin, SourceKey: sourceKey } = issued.Pins[0];
        expect(pin).toMatch(/^\d{8}$/);
        expect(sourceKey).toBeTruthy();

        // The stored value is a salted scrypt hash, never the PIN.
        const stored = await Rows<{ SecretHash: string | null }>(
            h,
            `SELECT vc.SecretHash FROM [${schema}].[VoterCredential] vc WHERE vc.EligibleVoterID = @v AND vc.RevokedAt IS NULL`,
            { v: target }
        );
        expect(stored).toHaveLength(1);
        expect(stored[0].SecretHash).toMatch(/^scrypt\$[\w-]+\$[\w-]+$/);
        expect(stored[0].SecretHash).not.toContain(pin);

        const second = { SourceKey: sourceKey as string, Pin: pin };
        const ok = await CredentialEngine.Instance.VerifyCredential(distribution, 'second-factor', { SourceKey: second.SourceKey, Pin: second.Pin }, h.Ctx);
        expect(ok.Success, 'the issued PIN verifies').toBe(true);
        expect((ok as { Value: { EligibleVoterID: string } }).Value.EligibleVoterID.toLowerCase()).toBe(target.toLowerCase());
        const wrong = await CredentialEngine.Instance.VerifyCredential(distribution, 'second-factor', { SourceKey: second.SourceKey, Pin: '00000000' }, h.Ctx);
        expect(wrong.Success).toBe(false);

        // Re-issuing replaces the PIN: the old one stops working.
        const reissued = Must(await CredentialEngine.Instance.IssueSecondFactorPins({ ElectionID: electionID, EligibleVoterIDs: [target] }, h.Ctx), 'IssueSecondFactorPins again');
        expect(reissued.Skipped).toBe(0);
        const oldPin = await CredentialEngine.Instance.VerifyCredential(distribution, 'second-factor', { SourceKey: second.SourceKey, Pin: pin }, h.Ctx);
        expect(oldPin.Success).toBe(reissued.Pins[0].Pin === pin);

        // Control numbers: stored as a SHA-256 hex digest.
        const numbers = Must(await CredentialEngine.Instance.IssueControlNumbers({ ElectionID: electionID, EligibleVoterIDs: [roll[1].EligibleVoterID] }, h.Ctx), 'IssueControlNumbers');
        expect(numbers.Numbers).toHaveLength(1);
        expect(numbers.Skipped).toBe(0);
        const hashes = await Rows<{ ControlNumberHash: string | null }>(
            h,
            `SELECT ControlNumberHash FROM [${schema}].[VoterCredential] WHERE EligibleVoterID = @v AND ControlNumberHash IS NOT NULL`,
            { v: roll[1].EligibleVoterID }
        );
        expect(hashes).toHaveLength(1);
        expect(hashes[0].ControlNumberHash).toMatch(/^[0-9a-f]{64}$/i);
        expect(hashes[0].ControlNumberHash?.toLowerCase()).not.toBe(numbers.Numbers[0].ControlNumber.toLowerCase());
    });
});

