import { describe, expect, it } from 'vitest';
import { ElectionAdministrationEngine } from '@mj-biz-apps/voting-server';
import {
    type mjBizAppsVotingContestEntity,
    type mjBizAppsVotingEligibleVoterEntity,
    type mjBizAppsVotingElectionEntity,
} from '@mj-biz-apps/voting-entities';
import { GetHarness } from '../support/harness.js';
import { CreateDraft, CreateOpenElection, CreatePeople, CreatePerson, LoadElection, LoadRoll, TrySave } from '../support/world.js';

const h = await GetHarness();

describe.skipIf(!h)('5. Entity invariants', () => {
    it('changing a Contest after the election is Open is refused', async () => {
        if (!h) return;
        const voters = await CreatePeople(h, 3, 'inv');
        const electionID = await CreateOpenElection(h, { Voters: voters, Overrides: { SecrecyMode: 'Secret' } });
        const res = await h.Provider.RunView<mjBizAppsVotingContestEntity>(
            { EntityName: 'MJ_BizApps_Voting: Contests', ExtraFilter: `ElectionID = '${electionID}'`, ResultType: 'entity_object' },
            h.System
        );
        expect(res.Success).toBe(true);
        const contest = res.Results[0];
        const before = contest.Name;
        contest.Name = `${before} (edited)`;
        const outcome = await TrySave(contest);
        expect(outcome.Saved).toBe(false);
        expect(outcome.Message.toLowerCase()).toContain('locked');

        const reload = await h.Provider.GetEntityObject<mjBizAppsVotingContestEntity>('MJ_BizApps_Voting: Contests', h.System);
        expect(await reload.Load(contest.ID)).toBe(true);
        expect(reload.Name).toBe(before);
    });

    it('an illegal status transition is refused (entity and engine)', async () => {
        if (!h) return;
        const voters = await CreatePeople(h, 3, 'trn');
        const openID = await CreateOpenElection(h, { Voters: voters, Overrides: { SecrecyMode: 'Secret' } });
        const open = await LoadElection(h, openID);
        open.Status = 'Draft';
        const back = await TrySave(open);
        expect(back.Saved, 'Open -> Draft').toBe(false);
        expect((await LoadElection(h, openID)).Status).toBe('Open');

        const draftID = await CreateDraft(h, { Voters: voters, Overrides: { SecrecyMode: 'Secret' } });
        const draft: mjBizAppsVotingElectionEntity = await LoadElection(h, draftID);
        draft.Status = 'Tallied';
        const jump = await TrySave(draft);
        expect(jump.Saved, 'Draft -> Tallied').toBe(false);
        expect((await LoadElection(h, draftID)).Status).toBe('Draft');

        const close = await ElectionAdministrationEngine.Instance.CloseElection(draftID, h.Ctx);
        expect(close.Success).toBe(false);
        expect((close as { Code: string }).Code).toBe('InvalidTransition');
    });

    it('a roll change after the freeze is refused unless the voter is flagged AddedAfterFreeze', async () => {
        if (!h) return;
        const voters = await CreatePeople(h, 3, 'roll');
        const electionID = await CreateOpenElection(h, { Voters: voters, Overrides: { SecrecyMode: 'Secret' } });
        const late = await CreatePerson(h, 'late');

        const unflagged = await h.Provider.GetEntityObject<mjBizAppsVotingEligibleVoterEntity>('MJ_BizApps_Voting: Eligible Voters', h.System);
        unflagged.NewRecord();
        unflagged.ElectionID = electionID;
        unflagged.PersonID = late.ID;
        unflagged.Weight = 1;
        unflagged.Status = 'Eligible';
        unflagged.AddedAfterFreeze = false;
        const refused = await TrySave(unflagged);
        expect(refused.Saved, 'unflagged addition').toBe(false);

        const roll = await LoadRoll(h, electionID);
        expect(roll).toHaveLength(3);

        const existing = await h.Provider.GetEntityObject<mjBizAppsVotingEligibleVoterEntity>('MJ_BizApps_Voting: Eligible Voters', h.System);
        expect(await existing.Load(roll[0].EligibleVoterID)).toBe(true);
        existing.Weight = 5;
        expect((await TrySave(existing)).Saved, 'weight change after freeze').toBe(false);

        const toDelete = await h.Provider.GetEntityObject<mjBizAppsVotingEligibleVoterEntity>('MJ_BizApps_Voting: Eligible Voters', h.System);
        expect(await toDelete.Load(roll[1].EligibleVoterID)).toBe(true);
        let deleted = false;
        try {
            deleted = await toDelete.Delete();
        } catch {
            deleted = false;
        }
        expect(deleted, 'delete after freeze').toBe(false);

        // Positive control: the same addition, flagged, goes through.
        const flagged = await h.Provider.GetEntityObject<mjBizAppsVotingEligibleVoterEntity>('MJ_BizApps_Voting: Eligible Voters', h.System);
        flagged.NewRecord();
        flagged.ElectionID = electionID;
        flagged.PersonID = late.ID;
        flagged.Weight = 1;
        flagged.Status = 'Eligible';
        flagged.AddedAfterFreeze = true;
        const accepted = await TrySave(flagged);
        expect(accepted.Saved, `flagged addition: ${accepted.Message}`).toBe(true);
        expect(await LoadRoll(h, electionID)).toHaveLength(4);
    });
});
