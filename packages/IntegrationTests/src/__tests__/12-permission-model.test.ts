/**
 * The voting permission model against a real database (docs/voting/security.md): who may read or write what.
 * Users are in-memory principals holding the named roles; the permission rows, the row-level-security filters and the
 * entity layer are the real ones.
 */

import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EntityPermissionType, UserInfo, UserRoleInfo } from '@memberjunction/core';
import { GetHarness, type Harness } from '../support/harness.js';
import { CreateDraft, CreateOpenElection, CreatePeople, RUN_TAG, Rows } from '../support/world.js';

const h = await GetHarness();
const P = 'MJ_BizApps_Voting: ';

/** Sensitive: voter-identifying, credential, poll-book, audit, roll or pre-publication result data. Never readable by UI. */
const SENSITIVE = [
    'Participations', 'Eligible Voters', 'Voter Credentials', 'Election Audit Events', 'Proxy Designations', 'Election Trustees',
    'Trustee Key Commitments', 'Election Anchors', 'Contest Results', 'Contest Option Results', 'Result Snapshots', 'Nominations',
    'Nomination Endorsements', 'Ballot Distributions', 'Cast Ballots', 'Ballot Selections', 'Ballot Attributions', 'Contest Running Tallies',
].map((n) => P + n);
const CATALOGS = ['Election Types', 'Tally Methods', 'Eligibility Source Types', 'Voter Credential Methods'].map((n) => P + n);
/** Tables nobody may ever DELETE from. */
const NEVER_DELETED = [
    'Participations', 'Eligible Voters', 'Voter Credentials', 'Election Audit Events', 'Proxy Designations', 'Election Trustees', 'Trustee Key Commitments',
    'Contest Results', 'Contest Option Results', 'Result Snapshots', 'Election Certifications', 'Election Certifiers', 'Cast Ballots', 'Ballot Selections',
    'Ballot Attributions', 'Contest Running Tallies',
].map((n) => P + n);

function principal(harness: Harness, roleNames: string[]): UserInfo {
    const id = randomUUID();
    const user = new UserInfo(harness.Provider, {
        ID: id,
        Name: `IT ${roleNames.join('+')}`,
        Email: `vt-${RUN_TAG}-${id.slice(0, 6)}@voting-it.invalid`,
        Type: 'User',
        IsActive: true,
        UserRoles: roleNames.map((name) => {
            const role = harness.Provider.Roles.find((r) => r.Name === name);
            if (!role) throw new Error(`role ${name} is not in the database`);
            return new UserRoleInfo({ UserID: id, RoleID: role.ID, Role: name });
        }),
    });
    return user;
}

async function can(harness: Harness, user: UserInfo, entity: string, type: EntityPermissionType): Promise<boolean> {
    const probe = await harness.Provider.GetEntityObject(entity, user);
    return probe.CheckPermissions(type, false);
}

async function readCount(harness: Harness, user: UserInfo, entity: string, filter = ''): Promise<number | 'refused'> {
    try {
        const res = await harness.Provider.RunView({ EntityName: entity, ExtraFilter: filter, ResultType: 'simple', Fields: ['ID'], MaxRows: 50 }, user);
        return res.Success ? (res.Results?.length ?? 0) : 'refused';
    } catch {
        return 'refused';
    }
}

describe.skipIf(!h)('12. The permission model', () => {
    it('only the intended roles hold grants on the voting tables, and the shipped matrix matches the design', async () => {
        if (!h) return;
        const rows = await Rows<{ Entity: string; Role: string; C: boolean; R: boolean; U: boolean; D: boolean; RLS: string | null }>(
            h,
            `SELECT e.Name AS Entity, r.Name AS Role, ep.CanCreate AS C, ep.CanRead AS R, ep.CanUpdate AS U, ep.CanDelete AS D, ep.ReadRLSFilterID AS RLS
               FROM [${h.CoreSchema}].[EntityPermission] ep
               JOIN [${h.CoreSchema}].[Entity] e ON e.ID = ep.EntityID
               JOIN [${h.CoreSchema}].[Role] r ON r.ID = ep.RoleID
              WHERE e.Name LIKE '${P}%'`
        );
        expect(rows.length).toBeGreaterThan(40);
        const allowedRoles = new Set(['UI', 'Voting Administrator', 'Election Inspector', 'Voting Ballot Engine', 'Developer', 'Integration']);
        for (const r of rows) {
            expect(allowedRoles.has(r.Role), `${r.Entity}: role ${r.Role}`).toBe(true);
            if (SENSITIVE.includes(r.Entity)) {
                expect(['Developer', 'Integration', 'UI'], `${r.Entity} must not be granted to ${r.Role}`).not.toContain(r.Role);
            }
            if (r.Role === 'Developer' || r.Role === 'Integration') expect(CATALOGS, `${r.Role} only on a catalog`).toContain(r.Entity);
            if (NEVER_DELETED.includes(r.Entity)) expect(r.D, `${r.Role} DELETE on ${r.Entity}`).toBe(false);
            if (r.Role === 'UI' && !CATALOGS.includes(r.Entity)) {
                expect(r.R && !r.C && !r.U && !r.D, `${r.Entity}: UI is read only`).toBe(true);
                expect(r.RLS, `${r.Entity}: UI read must carry a row-level-security filter`).not.toBeNull();
            }
        }
        // A trustee key commitment is written once by the key ceremony and is what every submitted share is checked against:
        // no role (not even the engine's) may rewrite one.
        const commitmentUpdaters = rows.filter((r) => r.Entity === P + 'Trustee Key Commitments' && r.U).map((r) => r.Role);
        expect(commitmentUpdaters, 'UPDATE on Trustee Key Commitments').toEqual([]);
        expect(rows.filter((r) => r.Entity === P + 'Trustee Key Commitments' && r.C).map((r) => r.Role).sort()).toEqual(['Voting Administrator', 'Voting Ballot Engine']);
        // Delete is granted nowhere in the app except to the engine on Ballot Comments (a revote replaces its comments).
        const deleters = rows.filter((r) => r.D).map((r) => `${r.Role}:${r.Entity}`);
        const catalogDeleters = deleters.filter((d) => CATALOGS.some((c) => d.endsWith(c)));
        expect(deleters.filter((d) => !catalogDeleters.includes(d))).toEqual([`Voting Ballot Engine:${P}Ballot Comments`]);
    });

    it('an ordinary signed-in user (UI) cannot read the poll book, roll, credentials, audit trail, trustees or unpublished results', async () => {
        if (!h) return;
        const member = principal(h, ['UI']);
        for (const entity of SENSITIVE) {
            expect(await can(h, member, entity, EntityPermissionType.Read), `${entity} read`).toBe(false);
            expect(await readCount(h, member, entity), `${entity} RunView`).toSatisfy((v: number | 'refused') => v === 'refused' || v === 0);
            expect(await can(h, member, entity, EntityPermissionType.Create), `${entity} create`).toBe(false);
        }
        for (const entity of CATALOGS) expect(await can(h, member, entity, EntityPermissionType.Read), `${entity} read`).toBe(true);
    });

    it('Developer and Integration users (with UI) are refused the same tables, and cannot administer elections', async () => {
        if (!h) return;
        const dev = principal(h, ['UI', 'Developer', 'Integration']);
        for (const entity of SENSITIVE) expect(await can(h, dev, entity, EntityPermissionType.Read), `${entity} read`).toBe(false);
        for (const entity of [P + 'Elections', P + 'Contests']) {
            expect(await can(h, dev, entity, EntityPermissionType.Create), `${entity} create`).toBe(false);
            expect(await can(h, dev, entity, EntityPermissionType.Delete), `${entity} delete`).toBe(false);
        }
    });

    it('a Voting Administrator can run the administrative reads and writes but never delete or touch the ballot box', async () => {
        if (!h) return;
        const admin = principal(h, ['UI', 'Voting Administrator']);
        for (const entity of ['Elections', 'Contests', 'Contest Options', 'Eligible Voters', 'Voter Credentials', 'Participations', 'Election Audit Events', 'Contest Results'].map((n) => P + n)) {
            expect(await can(h, admin, entity, EntityPermissionType.Read), `${entity} read`).toBe(true);
        }
        for (const entity of ['Elections', 'Contests', 'Eligible Voters', 'Voter Credentials', 'Election Trustees', 'Election Certifications'].map((n) => P + n)) {
            expect(await can(h, admin, entity, EntityPermissionType.Create), `${entity} create`).toBe(true);
        }
        for (const entity of [...NEVER_DELETED, P + 'Elections', P + 'Contests', P + 'Contest Options']) {
            expect(await can(h, admin, entity, EntityPermissionType.Delete), `${entity} delete`).toBe(false);
        }
        // The poll book and audit trail are not writable by a person at all.
        for (const entity of [P + 'Participations']) {
            expect(await can(h, admin, entity, EntityPermissionType.Create), `${entity} create`).toBe(false);
            expect(await can(h, admin, entity, EntityPermissionType.Update), `${entity} update`).toBe(false);
        }
        for (const entity of ['Cast Ballots', 'Ballot Selections', 'Ballot Attributions', 'Contest Running Tallies'].map((n) => P + n)) {
            expect(await can(h, admin, entity, EntityPermissionType.Read), `${entity} read`).toBe(false);
        }
    });

    it('an Election Inspector observes (poll book, roll, audit, results) and co-signs the certification, but cannot see credentials or change the roll', async () => {
        if (!h) return;
        const inspector = principal(h, ['UI', 'Election Inspector']);
        for (const entity of ['Elections', 'Eligible Voters', 'Participations', 'Election Audit Events', 'Contest Results', 'Result Snapshots', 'Election Certifications'].map((n) => P + n)) {
            expect(await can(h, inspector, entity, EntityPermissionType.Read), `${entity} read`).toBe(true);
        }
        for (const entity of ['Election Certifications', 'Election Certifiers'].map((n) => P + n)) {
            expect(await can(h, inspector, entity, EntityPermissionType.Create), `${entity} create`).toBe(true);
        }
        expect(await can(h, inspector, P + 'Voter Credentials', EntityPermissionType.Read)).toBe(false);
        expect(await can(h, inspector, P + 'Election Trustees', EntityPermissionType.Read)).toBe(false);
        for (const entity of ['Elections', 'Eligible Voters', 'Participations', 'Contest Results'].map((n) => P + n)) {
            expect(await can(h, inspector, entity, EntityPermissionType.Update), `${entity} update`).toBe(false);
            expect(await can(h, inspector, entity, EntityPermissionType.Delete), `${entity} delete`).toBe(false);
        }
    });

    it('members see an election only once its roll is frozen, and the frozen election no longer carries the CSV roll', async () => {
        if (!h) return;
        const people = await CreatePeople(h, 3, 'perm');
        const draftID = await CreateDraft(h, { Voters: people });
        const openID = await CreateOpenElection(h, { Voters: people });
        const member = principal(h, ['UI']);
        const admin = principal(h, ['UI', 'Voting Administrator']);

        expect(await readCount(h, member, P + 'Elections', `ID = '${draftID}'`), 'a draft election is hidden from members').toBe(0);
        expect(await readCount(h, member, P + 'Contests', `ElectionID = '${draftID}'`), 'its contests too').toBe(0);
        expect(await readCount(h, member, P + 'Elections', `ID = '${openID}'`), 'an open election is visible').toBe(1);
        expect(await readCount(h, member, P + 'Contests', `ElectionID = '${openID}'`), 'with its contests').toBeGreaterThan(0);
        expect(await readCount(h, admin, P + 'Elections', `ID = '${draftID}'`), 'an administrator sees the draft').toBe(1);

        const settings = await Rows<{ EligibilitySourceSettings: string | null }>(h, `SELECT EligibilitySourceSettings FROM [${await schema(h)}].[Election] WHERE ID = '${openID}'`);
        const stored = settings[0]?.EligibilitySourceSettings ?? '';
        for (const p of people) expect(stored.toLowerCase(), 'no roll email stays on a frozen election').not.toContain(p.Email.toLowerCase());
        expect(Object.keys(JSON.parse(stored) as Record<string, unknown>).sort(), 'only the marker and the digest stay').toEqual(['SettingsRedactedAtFreeze', 'SettingsSha256']);
        const draftSettings = await Rows<{ EligibilitySourceSettings: string | null }>(h, `SELECT EligibilitySourceSettings FROM [${await schema(h)}].[Election] WHERE ID = '${draftID}'`);
        expect(draftSettings[0]?.EligibilitySourceSettings ?? '').toContain(people[0].Email);
    });

    it('an election Configuration holds only documented keys, so what members can read of it is public by construction', async () => {
        if (!h) return;
        const people = await CreatePeople(h, 2, 'cfg');
        await expect(CreateDraft(h, { Voters: people, Overrides: { Configuration: { Quorum: { Kind: 'Count', Value: 1 }, AdminNotes: 'private' } } })).rejects.toThrow(/AdminNotes/);
        const ok = await CreateDraft(h, { Voters: people, Overrides: { Configuration: { Quorum: { Kind: 'Count', Value: 1 }, RequiredCertifiers: 1 } } });
        const stored = await Rows<{ Configuration: string | null }>(h, `SELECT Configuration FROM [${await schema(h)}].[Election] WHERE ID = '${ok}'`);
        expect(Object.keys(JSON.parse(stored[0]?.Configuration ?? '{}') as Record<string, unknown>).sort()).toEqual(['Quorum', 'RequiredCertifiers']);
    });

    it('the voting API scopes exist and the MJAPI application allows them', async () => {
        if (!h) return;
        const scopes = await Rows<{ FullPath: string }>(h, `SELECT FullPath FROM [${h.CoreSchema}].[APIScope] WHERE FullPath LIKE 'voting%'`);
        expect(scopes.map((s) => s.FullPath).sort()).toEqual(['voting', 'voting:admin', 'voting:trustee', 'voting:vote']);
        const allowed = await Rows<{ FullPath: string }>(
            h,
            `SELECT s.FullPath FROM [${h.CoreSchema}].[APIApplicationScope] a JOIN [${h.CoreSchema}].[APIScope] s ON s.ID = a.ScopeID JOIN [${h.CoreSchema}].[APIApplication] app ON app.ID = a.ApplicationID WHERE app.Name = 'MJAPI' AND s.FullPath LIKE 'voting:%'`
        );
        expect(allowed.map((s) => s.FullPath).sort()).toEqual(['voting:admin', 'voting:trustee', 'voting:vote']);
    });
});

let schemaName: string | null = null;
async function schema(harness: Harness): Promise<string> {
    schemaName ??= (await Rows<{ S: string }>(harness, `SELECT TOP 1 TABLE_SCHEMA AS S FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'CastBallot'`))[0].S;
    return schemaName;
}
