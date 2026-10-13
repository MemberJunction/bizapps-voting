import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EntityPermissionType, UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { type mjBizAppsVotingCastBallotEntity } from '@mj-biz-apps/voting-entities';
import { GetHarness } from '../support/harness.js';
import { CreateDraft, CreatePeople, RUN_TAG, Rows, Scalar, VotingSchema } from '../support/world.js';

const h = await GetHarness();
const CAST_BALLOTS = 'MJ_BizApps_Voting: Cast Ballots';
const BALLOT_BOX_ENTITIES = [CAST_BALLOTS, 'MJ_BizApps_Voting: Ballot Selections', 'MJ_BizApps_Voting: Ballot Attributions', 'MJ_BizApps_Voting: Contest Running Tallies'];
const PRIVILEGED_ROLES = ['developer', 'integration', 'voting administrator', 'election inspector', 'admin', 'administrator'];

/** A user with no roles at all and an id the database has never seen: nothing is granted to it by any permission row. */
function unprivilegedUser(): UserInfo {
    const user = new UserInfo();
    user.ID = randomUUID();
    user.Name = 'IT unprivileged';
    user.Email = `vt-${RUN_TAG}-nobody@voting-it.invalid`;
    user.Type = 'User';
    user.IsActive = true;
    return user;
}

/** A real, active, ordinary user from the database (neither the system user nor holding a privileged role), when there is one. */
function ordinaryDatabaseUser(): UserInfo | undefined {
    const systemID = UserCache.Instance.SYSTEM_USER_ID.toLowerCase();
    return UserCache.Users.find(
        (u) => u.IsActive && u.ID.toLowerCase() !== systemID && !(u.UserRoles ?? []).some((r) => PRIVILEGED_ROLES.includes((r.Role ?? '').trim().toLowerCase()))
    );
}

describe.skipIf(!h)('4. Access to the ballot box', () => {
    it("the only EntityPermission rows on the four entities belong to 'Voting Ballot Engine', none allow delete, and only the system user holds that role", async () => {
        if (!h) return;
        const names = BALLOT_BOX_ENTITIES.map((_, i) => `@n${i}`).join(',');
        const params = Object.fromEntries(BALLOT_BOX_ENTITIES.map((n, i) => [`n${i}`, n]));
        const found = await Scalar<number>(h, `SELECT COUNT(*) FROM [${h.CoreSchema}].[Entity] WHERE Name IN (${names})`, params);
        expect(found, 'all four entities are registered').toBe(BALLOT_BOX_ENTITIES.length);

        const perms = await Rows<{ Entity: string; Role: string; CanDelete: boolean }>(
            h,
            `SELECT e.Name AS Entity, r.Name AS Role, ep.CanDelete FROM [${h.CoreSchema}].[EntityPermission] ep
               JOIN [${h.CoreSchema}].[Entity] e ON e.ID = ep.EntityID
               JOIN [${h.CoreSchema}].[Role] r ON r.ID = ep.RoleID
              WHERE e.Name IN (${names})`,
            params
        );
        expect(perms.length).toBeGreaterThan(0);
        expect(new Set(perms.map((p) => p.Entity)).size, 'each entity has a permission row').toBe(BALLOT_BOX_ENTITIES.length);
        for (const p of perms) {
            expect(p.Role, `${p.Entity} permission role`).toBe('Voting Ballot Engine');
            expect(p.CanDelete, `${p.Entity} CanDelete`).toBe(false);
        }

        const holders = await Rows<{ UserID: string }>(
            h,
            `SELECT ur.UserID FROM [${h.CoreSchema}].[UserRole] ur JOIN [${h.CoreSchema}].[Role] r ON r.ID = ur.RoleID WHERE r.Name = 'Voting Ballot Engine'`
        );
        expect(holders).toHaveLength(1);
        expect(holders[0].UserID.toLowerCase()).toBe(h.System.ID.toLowerCase());
    });

    it('the ballot-box entities are not tracked and cannot be deleted through the API', async () => {
        if (!h) return;
        const names = BALLOT_BOX_ENTITIES.map((_, i) => `@n${i}`).join(',');
        const params = Object.fromEntries(BALLOT_BOX_ENTITIES.map((n, i) => [`n${i}`, n]));
        const request = h.Pool.request();
        for (const [k, v] of Object.entries(params)) request.input(k, v);
        const rows = (
            await request.query(
                `SELECT Name, AllowDeleteAPI, TrackRecordChanges, AuditRecordAccess FROM [${h.CoreSchema}].[Entity] WHERE Name IN (${names})`
            )
        ).recordset as Array<{ Name: string; AllowDeleteAPI: boolean; TrackRecordChanges: boolean; AuditRecordAccess: boolean }>;
        expect(rows).toHaveLength(BALLOT_BOX_ENTITIES.length);
        for (const r of rows) {
            // BallotAttribution is the Open/Confidential voter link (never written for Secret), so record tracking there leaks nothing new.
            if (r.Name !== 'MJ_BizApps_Voting: Ballot Attributions') expect(r.TrackRecordChanges, `${r.Name} TrackRecordChanges`).toBe(false);
            expect(r.AllowDeleteAPI, `${r.Name} AllowDeleteAPI`).toBe(false);
            expect(r.AuditRecordAccess, `${r.Name} AuditRecordAccess`).toBe(false);
        }
    });

    it('a non-admin, non-system user cannot read Cast Ballots through RunView', async () => {
        if (!h) return;
        const users = [unprivilegedUser(), ordinaryDatabaseUser()].filter((u): u is UserInfo => !!u);
        for (const user of users) {
            let refused = false;
            let rowCount = 0;
            try {
                const res = await h.Provider.RunView({ EntityName: CAST_BALLOTS, ResultType: 'simple', MaxRows: 5 }, user);
                refused = !res.Success;
                rowCount = res.Results?.length ?? 0;
            } catch {
                refused = true;
            }
            expect(refused || rowCount === 0, `user ${user.Name} must be refused or see zero rows`).toBe(true);
            expect(rowCount).toBe(0);
        }
    });

    it('Developer, Integration and Voting Administrator users are refused too', async () => {
        if (!h) return;
        const wanted = ['developer', 'integration', 'voting administrator'];
        const systemID = h.System.ID.toLowerCase();
        const candidates = UserCache.Users.filter(
            (u) => u.IsActive && u.ID.toLowerCase() !== systemID && (u.UserRoles ?? []).some((r) => wanted.includes((r.Role ?? '').trim().toLowerCase()))
        );
        for (const user of candidates.slice(0, 5)) {
            let rowCount = 0;
            try {
                const res = await h.Provider.RunView({ EntityName: CAST_BALLOTS, ResultType: 'simple', MaxRows: 5 }, user);
                rowCount = res.Success ? (res.Results?.length ?? 0) : 0;
            } catch {
                rowCount = 0;
            }
            expect(rowCount, `privileged user ${user.Name} sees no ballots`).toBe(0);
        }
        // Create and read are denied at the entity-permission level for them as well.
        for (const user of candidates.slice(0, 5)) {
            const probe = await h.Provider.GetEntityObject<mjBizAppsVotingCastBallotEntity>(CAST_BALLOTS, user);
            expect(probe.CheckPermissions(EntityPermissionType.Create, false), `${user.Name} create`).toBe(false);
            expect(probe.CheckPermissions(EntityPermissionType.Read, false), `${user.Name} read`).toBe(false);
        }
        expect(candidates.length, 'at least one privileged user exists to test').toBeGreaterThan(0);
    });

    it('a direct Save of a CastBallot outside the cast engine is refused by the entity server class', async () => {
        if (!h) return;
        const schema = await VotingSchema(h);
        const voters = await CreatePeople(h, 2, 'acc');
        const electionID = await CreateDraft(h, { Voters: voters });
        const receipt = `ZZZZ-${RUN_TAG.slice(0, 4).toUpperCase().replace(/[^0-9A-Z]/g, '0')}-0000-0000-0000`;

        const ballot = await h.Provider.GetEntityObject<mjBizAppsVotingCastBallotEntity>(CAST_BALLOTS, h.System);
        ballot.NewRecord();
        ballot.ElectionID = electionID;
        ballot.BallotStyleHash = 'x';
        ballot.ReceiptCode = receipt;
        ballot.Selections = 'not-a-real-ciphertext';
        ballot.Status = 'Counted';

        // The invariant itself: the server class refuses a create made outside BallotBoxWriteGuard.
        const validation = await ballot.ValidateAsync();
        expect(validation.Success).toBe(false);
        expect(validation.Errors.map((e) => e.Message).join(' ')).toContain('only be created by the cast engine');

        // And the save does not go through, whichever layer stops it first.
        let saved = false;
        try {
            saved = await ballot.Save();
        } catch {
            saved = false;
        }
        expect(saved).toBe(false);
        expect(await Scalar<number>(h, `SELECT COUNT(*) FROM [${schema}].[CastBallot] WHERE ReceiptCode = @r`, { r: receipt })).toBe(0);
    });
});
