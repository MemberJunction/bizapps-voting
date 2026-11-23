import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import {
    BallotStyleBuilder,
    CastEngine,
    ElectionAdministrationEngine,
    LoadElectionGraph,
    ResultsEngine,
    TallyEngine,
    VoterIdentityResolver,
} from '@mj-biz-apps/voting-server';
import { GetHarness } from '../support/harness.js';
import { CastVote, CreateOpenElection, CreatePeople, CreatePerson, LoadRoll, Must, PickOption, Rows, VotingSchema } from '../support/world.js';

const h = await GetHarness();

describe.skipIf(!h)('13. Named roll call (V1), Common person link (V2), and host ballot entry (V3)', () => {
    it('CastForVoter enters InPerson ballots by SourceKey and EligibleVoterID, audits actor without ballot content, and GetRollCall reads live, after revote, and after tally', async () => {
        if (!h) return;
        const schema = await VotingSchema(h);
        const voters = await CreatePeople(h, 4, 'rc');
        const electionID = await CreateOpenElection(h, {
            Voters: voters,
            Overrides: { SecrecyMode: 'Open', ResultsTiming: 'AdministratorsOnly', Configuration: { AllowRevote: true } },
        });
        const roll = await LoadRoll(h, electionID);
        expect(roll).toHaveLength(4);

        const graph = Must(await LoadElectionGraph(electionID, h.Ctx), 'LoadElectionGraph');
        const style = await BallotStyleBuilder.Instance.Build(graph, null, 'en', h.Ctx);
        const contestID = style.Contests[0].ContestID;
        const yesID = style.Contests[0].Options[0].OptionID;
        const noID = style.Contests[0].Options[1].OptionID;

        // Pick a real non-system user row so FK constraints on EnteredByUserID and ActorUserID are exercised.
        const [nonSystemUser] = await Rows<{ ID: string }>(
            h,
            `SELECT TOP 1 ID FROM [${h.CoreSchema}].[User] WHERE ID <> @sys ORDER BY __mj_CreatedAt ASC`,
            { sys: h.System.ID }
        );
        const enteringUserID = nonSystemUser?.ID ?? h.System.ID;

        // 1. Cast by SourceKey (k0 -> Yes)
        const cast0 = Must(
            await CastEngine.Instance.CastForVoter(
                {
                    ElectionID: electionID,
                    SourceKey: 'k0',
                    Submission: { Contests: [{ ContestID: contestID, Selections: [{ OptionID: yesID }] }] },
                    EnteredByUserID: enteringUserID,
                },
                h.Ctx
            ),
            'CastForVoter by SourceKey'
        );
        expect(cast0.ReceiptCode).toMatch(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){4}$/);

        // 2. Cast by EligibleVoterID (k1 -> Abstain) using the host system-context + Actor pattern (no explicit EnteredByUserID)
        const v1 = roll.find((r) => r.PersonID.toLowerCase() === voters[1].ID.toLowerCase())!;
        const hostActorCtx = { ContextUser: h.System, Provider: h.Provider, Actor: { UserID: enteringUserID } };
        Must(
            await CastEngine.Instance.CastForVoter(
                {
                    ElectionID: electionID,
                    EligibleVoterID: v1.EligibleVoterID,
                    Submission: { Contests: [{ ContestID: contestID, Abstain: true, Selections: [] }] },
                },
                hostActorCtx
            ),
            'CastForVoter by EligibleVoterID via Actor context'
        );

        // Verify both poll-book rows carry Channel = 'InPerson' and EnteredByUserID = enteringUserID (explicit & Actor-derived)
        const partRows = await Rows<{ EligibleVoterID: string; Channel: string; EnteredByUserID: string | null }>(
            h,
            `SELECT EligibleVoterID, Channel, EnteredByUserID FROM [${schema}].[Participation] WHERE ElectionID = @e`,
            { e: electionID }
        );
        expect(partRows).toHaveLength(2);
        for (const row of partRows) {
            expect(row.Channel).toBe('InPerson');
            expect(row.EnteredByUserID?.toLowerCase()).toBe(enteringUserID.toLowerCase());
        }

        // Verify audit event names the entering user as actor and carries zero ballot content
        const auditRows = await Rows<{ EventType: string; ActorUserID: string | null; Details: string | null }>(
            h,
            `SELECT EventType, ActorUserID, Details FROM [${schema}].[ElectionAuditEvent] WHERE ElectionID = @e AND EventType = 'BallotEntered'`,
            { e: electionID }
        );
        expect(auditRows.length).toBeGreaterThanOrEqual(2);
        for (const ev of auditRows) {
            expect(ev.ActorUserID?.toLowerCase()).toBe(enteringUserID.toLowerCase());
            expect(ev.Details ?? '').not.toContain(cast0.ReceiptCode);
            expect((ev.Details ?? '').toLowerCase()).not.toContain(yesID.toLowerCase());
        }

        // 3. GetRollCall while Open (live decryption under AdministratorsOnly) + RollCallViewed audit
        const live = Must(await ResultsEngine.Instance.GetRollCall(electionID, hostActorCtx), 'GetRollCall live');
        expect(live.Status).toBe('Open');
        expect(live.Contests).toHaveLength(1);
        const liveEntries = live.Contests[0].Entries;
        expect(liveEntries).toHaveLength(4);
        const e0 = liveEntries.find((e) => e.EligibleVoterID.toLowerCase() === cast0.EligibleVoterID.toLowerCase())!;
        const e1 = liveEntries.find((e) => e.EligibleVoterID.toLowerCase() === v1.EligibleVoterID.toLowerCase())!;
        const e2 = liveEntries.find((e) => e.PersonID.toLowerCase() === voters[2].ID.toLowerCase())!;
        expect(e0).toMatchObject({ HasVoted: true, Abstain: false, Channel: 'InPerson' });
        expect(e0.Selections.map((s) => s.OptionID.toLowerCase())).toEqual([yesID.toLowerCase()]);
        expect(e0.EnteredByUserID?.toLowerCase()).toBe(enteringUserID.toLowerCase());
        expect(e1).toMatchObject({ HasVoted: true, Abstain: true, Selections: [], Channel: 'InPerson' });
        expect(e2).toMatchObject({ HasVoted: false, Abstain: false, Selections: [] });

        const rcAuditRows = await Rows<{ ActorUserID: string | null; Details: string | null }>(
            h,
            `SELECT ActorUserID, Details FROM [${schema}].[ElectionAuditEvent] WHERE ElectionID = @e AND EventType = 'RollCallViewed'`,
            { e: electionID }
        );
        expect(rcAuditRows.length).toBeGreaterThanOrEqual(1);
        expect(rcAuditRows[0].ActorUserID?.toLowerCase()).toBe(enteringUserID.toLowerCase());
        expect((rcAuditRows[0].Details ?? '').toLowerCase()).not.toContain(yesID.toLowerCase());
        expect((rcAuditRows[0].Details ?? '').toLowerCase()).not.toContain(cast0.EligibleVoterID.toLowerCase());

        // 4. Revote k0 from Yes -> No via Actor context (no explicit EnteredByUserID) and verify live GetRollCall reflects only the Counted ballot
        Must(
            await CastEngine.Instance.CastForVoter(
                {
                    ElectionID: electionID,
                    SourceKey: 'k0',
                    Submission: { Contests: [{ ContestID: contestID, Selections: [{ OptionID: noID }] }] },
                },
                hostActorCtx
            ),
            'CastForVoter revote'
        );
        const afterRevote = Must(await ResultsEngine.Instance.GetRollCall(electionID, hostActorCtx), 'GetRollCall after revote');
        const e0Revoted = afterRevote.Contests[0].Entries.find((e) => e.EligibleVoterID.toLowerCase() === cast0.EligibleVoterID.toLowerCase())!;
        expect(e0Revoted.Selections.map((s) => s.OptionID.toLowerCase())).toEqual([noID.toLowerCase()]);

        // 4b. Online participation cannot be overwritten by CastForVoter unless AllowOverrideOnline: true
        const v3 = roll.find((r) => r.PersonID.toLowerCase() === voters[3].ID.toLowerCase())!;
        expect((await CastVote(h, electionID, v3.EligibleVoterID, 0)).Success).toBe(true);
        const blockedOverride = await CastEngine.Instance.CastForVoter(
            {
                ElectionID: electionID,
                EligibleVoterID: v3.EligibleVoterID,
                Submission: { Contests: [{ ContestID: contestID, Selections: [{ OptionID: noID }] }] },
            },
            hostActorCtx
        );
        expect(blockedOverride.Success).toBe(false);
        if (!blockedOverride.Success) expect(blockedOverride.Code).toBe('OnlineOverrideNotAllowed');
        Must(
            await CastEngine.Instance.CastForVoter(
                {
                    ElectionID: electionID,
                    EligibleVoterID: v3.EligibleVoterID,
                    Submission: { Contests: [{ ContestID: contestID, Selections: [{ OptionID: noID }] }] },
                    AllowOverrideOnline: true,
                },
                hostActorCtx
            ),
            'CastForVoter with AllowOverrideOnline'
        );

        // 5. Close + Tally, then verify GetRollCall reads materialized Ballot Selections identically
        Must(await ElectionAdministrationEngine.Instance.CloseElection(electionID, h.Ctx), 'CloseElection');
        const tallied = Must(await TallyEngine.Instance.Tally(electionID, undefined, h.Ctx), 'Tally');
        expect(tallied.BallotsCounted).toBe(3);

        const afterTally = Must(await ResultsEngine.Instance.GetRollCall(electionID, hostActorCtx), 'GetRollCall after tally');
        expect(afterTally.Status).toBe('Tallied');
        const e0Final = afterTally.Contests[0].Entries.find((e) => e.EligibleVoterID.toLowerCase() === cast0.EligibleVoterID.toLowerCase())!;
        const e1Final = afterTally.Contests[0].Entries.find((e) => e.EligibleVoterID.toLowerCase() === v1.EligibleVoterID.toLowerCase())!;
        const e2Final = afterTally.Contests[0].Entries.find((e) => e.PersonID.toLowerCase() === voters[2].ID.toLowerCase())!;
        const e3Final = afterTally.Contests[0].Entries.find((e) => e.EligibleVoterID.toLowerCase() === v3.EligibleVoterID.toLowerCase())!;
        expect(e0Final.Selections.map((s) => s.OptionID.toLowerCase())).toEqual([noID.toLowerCase()]);
        expect(e1Final.Abstain).toBe(true);
        expect(e2Final.HasVoted).toBe(false);
        expect(e3Final.Selections.map((s) => s.OptionID.toLowerCase())).toEqual([noID.toLowerCase()]);
    });

    it('GetRollCall refuses Open elections while Open/Closed when ResultsTiming is AfterClose, then allows after Tally', async () => {
        if (!h) return;
        const voters = await CreatePeople(h, 2, 'rc-afterclose');
        const electionID = await CreateOpenElection(h, {
            Voters: voters,
            Overrides: { SecrecyMode: 'Open', ResultsTiming: 'AfterClose' },
        });
        const roll = await LoadRoll(h, electionID);
        expect((await CastVote(h, electionID, roll[0].EligibleVoterID, 0)).Success).toBe(true);

        const whileOpen = await ResultsEngine.Instance.GetRollCall(electionID, h.Ctx);
        expect(whileOpen.Success).toBe(false);
        if (!whileOpen.Success) expect(whileOpen.Code).toBe('ResultsNotVisible');

        Must(await ElectionAdministrationEngine.Instance.CloseElection(electionID, h.Ctx), 'CloseElection');
        const whileClosed = await ResultsEngine.Instance.GetRollCall(electionID, h.Ctx);
        expect(whileClosed.Success).toBe(false);
        if (!whileClosed.Success) expect(whileClosed.Code).toBe('ResultsNotVisible');

        Must(await TallyEngine.Instance.Tally(electionID, undefined, h.Ctx), 'Tally');
        const afterTally = Must(await ResultsEngine.Instance.GetRollCall(electionID, h.Ctx), 'GetRollCall after tally');
        expect(afterTally.Status).toBe('Tallied');
        expect(afterTally.Contests[0].Entries.filter((e) => e.HasVoted)).toHaveLength(1);
    });

    it('GetRollCall refuses Confidential and Secret elections both while Open and after Tally', async () => {
        if (!h) return;
        for (const mode of ['Confidential', 'Secret'] as const) {
            const voters = await CreatePeople(h, 2, `rc-${mode.toLowerCase()}`);
            const electionID = await CreateOpenElection(h, { Voters: voters, Overrides: { SecrecyMode: mode } });
            const roll = await LoadRoll(h, electionID);
            expect((await CastVote(h, electionID, roll[0].EligibleVoterID, 0)).Success).toBe(true);

            const whileOpen = await ResultsEngine.Instance.GetRollCall(electionID, h.Ctx);
            expect(whileOpen.Success).toBe(false);
            if (!whileOpen.Success) expect(whileOpen.Code).toBe('NotOpenBallot');

            Must(await ElectionAdministrationEngine.Instance.CloseElection(electionID, h.Ctx), 'CloseElection');
            Must(await TallyEngine.Instance.Tally(electionID, undefined, h.Ctx), 'Tally');

            const afterTally = await ResultsEngine.Instance.GetRollCall(electionID, h.Ctx);
            expect(afterTally.Success).toBe(false);
            if (!afterTally.Success) expect(afterTally.Code).toBe('NotOpenBallot');
        }
    });

    it('VoterIdentityResolver matches a signed-in user via User.LinkedEntityID + LinkedEntityRecordID even when LinkedUserID is null and Email differs', async () => {
        if (!h) return;
        const person = await CreatePerson(h, 'v2link');
        const electionID = await CreateOpenElection(h, { Voters: [person], Overrides: { SecrecyMode: 'Open' } });
        const roll = await LoadRoll(h, electionID);
        expect(roll).toHaveLength(1);

        const peopleEntity = h.Provider.Entities.find((e) => e.Name === 'MJ_BizApps_Common: People');
        expect(peopleEntity).toBeTruthy();

        const syntheticUser = new UserInfo(h.Provider, {
            ID: `${randomBytes(4).toString('hex')}-1111-4111-8111-${randomBytes(6).toString('hex')}`,
            Email: `unrelated-${randomBytes(4).toString('hex')}@nowhere.invalid`,
            LinkedEntityID: peopleEntity!.ID,
            LinkedEntityRecordID: person.ID,
            UserRoles: [],
        });

        const identity = await VoterIdentityResolver.Resolve(electionID, { ContextUser: syntheticUser, Provider: h.Provider });
        expect(identity).not.toBeNull();
        expect(identity?.Via).toBe('MJSession');
        expect(identity?.EligibleVoterID.toLowerCase()).toBe(roll[0].EligibleVoterID.toLowerCase());

        // Sanity check: a ballot can actually be cast using the resolved identity (not refused)
        const graph = Must(await LoadElectionGraph(electionID, h.Ctx), 'LoadElectionGraph');
        const style = await BallotStyleBuilder.Instance.Build(graph, null, 'en', h.Ctx);
        const cast = await CastEngine.Instance.Cast(
            {
                ElectionID: electionID,
                EligibleVoterID: identity!.EligibleVoterID,
                BallotStyleHash: style.Hash,
                Submission: PickOption(style, 0),
                Channel: 'Online',
            },
            h.Ctx
        );
        expect(cast.Success).toBe(true);
    });
});
