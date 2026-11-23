/**
 * Idempotent persona provisioning for the wire tier. Server side: it talks to MJ_Voting_Dev directly (through the same
 * harness the database tier uses) because a user API key can only be minted by the server's APIKeyEngine, and a key can
 * only be created for the authenticated user.
 *
 * For each persona in PERSONA_SPECS it ensures, through MJ entities only (no raw SQL):
 *   1. a User (natural key: Email),
 *   2. one User Role per role name,
 *   3. a bizapps-common Person (natural key: Email) whose LinkedUserID is the user, when the persona has one,
 *   4. a live user API key, recorded in the gitignored personas file. Keys are never printed.
 *
 * Re-running keeps what is correct: a recorded key that still validates is reused; a missing or revoked one is replaced.
 *
 *   pnpm --filter @mj-biz-apps/voting-integration-tests run build && \
 *   pnpm --filter @mj-biz-apps/voting-integration-tests run provision:personas
 */
import { RunView } from '@memberjunction/core';
import { GetAPIKeyEngine } from '@memberjunction/api-keys';
import { type MJAPIKeyScopeEntity, type MJAPIScopeEntity, type MJEntityPermissionEntity, type MJRoleEntity, type MJUserEntity, type MJUserRoleEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { type mjBizAppsCommonPersonEntity } from '@mj-biz-apps/common-entities';
import { GetHarness, TEST_DATABASE, type Harness } from '../support/harness.js';
import { PERSONA_SPECS, PersonaEmail, type PersonaRecord, type PersonaSpec } from '../wire/persona-model.js';
import { ReadPersonasFile, WritePersonasFile } from '../wire/persona-store.js';

const USERS = 'MJ: Users';
const USER_ROLES = 'MJ: User Roles';
const ROLES = 'MJ: Roles';
const PEOPLE = 'MJ_BizApps_Common: People';
const API_KEYS = 'MJ: API Keys';
const API_SCOPES = 'MJ: API Scopes';
const API_KEY_SCOPES = 'MJ: API Key Scopes';
const ROLES_ENTITY_PERMISSIONS = 'MJ: Entity Permissions';

/**
 * The role the wire host's /vote edge stamps on guest ballot sessions (its `GuestRoleName` setting, set in the host's
 * mj.config.cjs). A guest ballot session holds NO voting entity grant (docs/voting/security.md): every voter operation
 * authorizes the session's signed scope and then acts as the system principal. This TEST-ONLY role grants just the three MJ
 * reads every restricted role needs (MAGIC_LINK_GUIDE step 2); provisioning revokes any other grant it finds on the role, so
 * a database provisioned under the earlier model (read on the election, contests, roll and poll book) is brought back to it.
 */
export const GUEST_ROLE_NAME = 'Voting Wire Guest';
const GUEST_READ_ENTITIES: readonly string[] = ['MJ: User Roles', 'MJ: User Applications', 'MJ: Application Roles'];
const KEY_LABEL = 'voting-wire persona';

function literal(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

async function findOne<T>(h: Harness, entityName: string, filter: string): Promise<T | null> {
    const res = await RunView.FromMetadataProvider(h.Provider).RunView<T>({ EntityName: entityName, ExtraFilter: filter, ResultType: 'entity_object', MaxRows: 1 }, h.System);
    if (!res.Success) throw new Error(`${entityName} lookup failed: ${res.ErrorMessage}`);
    return res.Results[0] ?? null;
}

async function ensureUser(h: Harness, spec: PersonaSpec): Promise<MJUserEntity> {
    const email = PersonaEmail(spec.Key);
    const existing = await findOne<MJUserEntity>(h, USERS, `Email = ${literal(email)}`);
    const user = existing ?? (await h.Provider.GetEntityObject<MJUserEntity>(USERS, h.System));
    if (!existing) {
        user.NewRecord();
        user.Email = email;
        user.Name = email;
        user.Type = 'User';
    }
    user.FirstName = spec.FirstName;
    user.LastName = spec.LastName;
    user.IsActive = true;
    if (user.Dirty && !(await user.Save())) throw new Error(`User ${email}: ${user.LatestResult?.CompleteMessage ?? 'save failed'}`);
    return user;
}

async function ensureRoles(h: Harness, user: MJUserEntity, roleNames: string[]): Promise<void> {
    for (const roleName of roleNames) {
        const role = await findOne<MJRoleEntity>(h, ROLES, `Name = ${literal(roleName)}`);
        if (!role) throw new Error(`Role "${roleName}" does not exist in ${TEST_DATABASE}. Has the voting migration/metadata been applied?`);
        const has = await findOne<MJUserRoleEntity>(h, USER_ROLES, `UserID = ${literal(user.ID)} AND RoleID = ${literal(role.ID)}`);
        if (has) continue;
        const link = await h.Provider.GetEntityObject<MJUserRoleEntity>(USER_ROLES, h.System);
        link.NewRecord();
        link.UserID = user.ID;
        link.RoleID = role.ID;
        if (!(await link.Save())) throw new Error(`User Role ${user.Email} -> ${roleName}: ${link.LatestResult?.CompleteMessage ?? 'save failed'}`);
    }
}

async function ensurePerson(h: Harness, spec: PersonaSpec, user: MJUserEntity): Promise<string> {
    const email = PersonaEmail(spec.Key);
    const existing = await findOne<mjBizAppsCommonPersonEntity>(h, PEOPLE, `Email = ${literal(email)}`);
    const person = existing ?? (await h.Provider.GetEntityObject<mjBizAppsCommonPersonEntity>(PEOPLE, h.System));
    if (!existing) {
        person.NewRecord();
        person.Email = email;
        person.Status = 'Active';
    }
    person.FirstName = spec.FirstName;
    person.LastName = spec.LastName;
    person.LinkedUserID = user.ID;
    if (person.Dirty && !(await person.Save())) throw new Error(`Person ${email}: ${person.LatestResult?.CompleteMessage ?? 'save failed'}`);
    return person.ID;
}

/** The id of the live key row for `rawKey` when it is owned by `userID`, else null. */
async function liveKeyID(h: Harness, rawKey: string | undefined, userID: string): Promise<string | null> {
    if (!rawKey) return null;
    const engine = GetAPIKeyEngine();
    const check = await engine.ValidateKeyByHash(engine.HashAPIKey(rawKey), h.System);
    return check.Valid && check.APIKey && UUIDsEqual(check.APIKey.UserID, userID) ? check.APIKey.ID : null;
}

/** Revokes the persona's earlier keys that this tier labelled, so a replaced key leaves nothing live behind. */
async function revokeOldKeys(h: Harness, userID: string): Promise<void> {
    const engine = GetAPIKeyEngine();
    const res = await RunView.FromMetadataProvider(h.Provider).RunView<{ ID: string }>(
        { EntityName: API_KEYS, ExtraFilter: `UserID = ${literal(userID)} AND Label = ${literal(KEY_LABEL)} AND Status = 'Active'`, Fields: ['ID'], ResultType: 'simple' },
        h.System
    );
    for (const row of res.Success ? res.Results : []) await engine.RevokeAPIKey(row.ID, h.System, h.Provider);
}

/**
 * Gives the key the `full_access` scope. The voting Remote Operations declare RequiredScope values (`voting:admin`,
 * `voting:vote`, `voting:trustee`) but the database defines no such API Scope rows, and MJAPI enforces scopes with a default
 * of deny, so a key with no scopes cannot even download metadata. `full_access` hands the decision back to what this tier
 * actually tests: the user's Roles, entity permissions and each operation's own Authorize.
 */
async function ensureFullAccessScope(h: Harness, apiKeyID: string): Promise<void> {
    const scope = await findOne<MJAPIScopeEntity>(h, API_SCOPES, `FullPath = 'full_access'`);
    if (!scope) throw new Error("The 'full_access' API Scope does not exist in this database.");
    const has = await findOne<MJAPIKeyScopeEntity>(h, API_KEY_SCOPES, `APIKeyID = ${literal(apiKeyID)} AND ScopeID = ${literal(scope.ID)}`);
    if (has) return;
    const link = await h.Provider.GetEntityObject<MJAPIKeyScopeEntity>(API_KEY_SCOPES, h.System);
    link.NewRecord();
    link.APIKeyID = apiKeyID;
    link.ScopeID = scope.ID;
    link.ResourcePattern = '*';
    link.PatternType = 'Include';
    link.IsDeny = false;
    link.Priority = 0;
    if (!(await link.Save())) throw new Error(`API Key Scope: ${link.LatestResult?.CompleteMessage ?? 'save failed'}`);
}

async function ensureKey(h: Harness, user: MJUserEntity, recorded: PersonaRecord | undefined): Promise<string> {
    const live = await liveKeyID(h, recorded?.APIKey, user.ID);
    if (live) {
        await ensureFullAccessScope(h, live);
        return recorded!.APIKey;
    }
    await revokeOldKeys(h, user.ID);
    const created = await GetAPIKeyEngine().CreateAPIKey({ UserId: user.ID, Label: KEY_LABEL, Description: 'Wire-tier persona key (provisioned by IntegrationTests)' }, h.System, h.Provider);
    if (!created.Success || !created.RawKey) throw new Error(`API key for ${user.Email}: ${created.Error ?? 'creation failed'}`);
    await ensureFullAccessScope(h, created.APIKeyId as string);
    return created.RawKey;
}

/** Deletes every entity permission on the guest role outside GUEST_READ_ENTITIES; returns how many it removed. */
async function revokeOtherGrants(h: Harness, roleID: string): Promise<number> {
    const keep = GUEST_READ_ENTITIES.map((name) => h.Provider.EntityByName(name)?.ID).filter((id): id is string => !!id);
    const res = await RunView.FromMetadataProvider(h.Provider).RunView<MJEntityPermissionEntity>(
        { EntityName: ROLES_ENTITY_PERMISSIONS, ExtraFilter: `RoleID = ${literal(roleID)}`, ResultType: 'entity_object' },
        h.System
    );
    if (!res.Success) throw new Error(`Entity Permissions of ${GUEST_ROLE_NAME}: ${res.ErrorMessage}`);
    let revoked = 0;
    for (const permission of res.Results) {
        if (keep.some((id) => UUIDsEqual(id, permission.EntityID))) continue;
        if (!(await permission.Delete())) throw new Error(`Revoking ${GUEST_ROLE_NAME} -> ${permission.Entity}: ${permission.LatestResult?.CompleteMessage ?? 'delete failed'}`);
        revoked++;
    }
    return revoked;
}

async function ensureGuestRole(h: Harness): Promise<void> {
    let role = await findOne<MJRoleEntity>(h, ROLES, `Name = ${literal(GUEST_ROLE_NAME)}`);
    if (!role) {
        role = await h.Provider.GetEntityObject<MJRoleEntity>(ROLES, h.System);
        role.NewRecord();
        role.Name = GUEST_ROLE_NAME;
        role.Description = 'Wire-tier test role for guest ballot sessions: the MJ reads a restricted role needs, no voting entity. Created by IntegrationTests provisioning.';
        if (!(await role.Save())) throw new Error(`Role ${GUEST_ROLE_NAME}: ${role.LatestResult?.CompleteMessage ?? 'save failed'}`);
    }
    for (const entityName of GUEST_READ_ENTITIES) {
        const entity = h.Provider.EntityByName(entityName);
        if (!entity) throw new Error(`Entity "${entityName}" is not in metadata.`);
        const has = await findOne<MJEntityPermissionEntity>(h, ROLES_ENTITY_PERMISSIONS, `EntityID = ${literal(entity.ID)} AND RoleID = ${literal(role.ID)}`);
        if (has) continue;
        const permission = await h.Provider.GetEntityObject<MJEntityPermissionEntity>(ROLES_ENTITY_PERMISSIONS, h.System);
        permission.NewRecord();
        permission.EntityID = entity.ID;
        permission.RoleID = role.ID;
        permission.CanCreate = false;
        permission.CanRead = true;
        permission.CanUpdate = false;
        permission.CanDelete = false;
        if (!(await permission.Save())) throw new Error(`Entity Permission ${GUEST_ROLE_NAME} -> ${entityName}: ${permission.LatestResult?.CompleteMessage ?? 'save failed'}`);
    }
    const revoked = await revokeOtherGrants(h, role.ID);
    console.log(`  guest role      ${GUEST_ROLE_NAME} (read on ${GUEST_READ_ENTITIES.length} entities${revoked > 0 ? `; revoked ${revoked} other grant(s)` : ''})`);
}

export async function ProvisionPersonas(): Promise<PersonaRecord[]> {
    const h = await GetHarness();
    if (!h) throw new Error(`Cannot provision: ${TEST_DATABASE} is unreachable (see the warning above).`);
    const engine = GetAPIKeyEngine();
    await engine.Config(false, h.System, h.Provider);

    await ensureGuestRole(h);
    const previous = ReadPersonasFile();
    const records: PersonaRecord[] = [];
    for (const spec of PERSONA_SPECS) {
        const user = await ensureUser(h, spec);
        await ensureRoles(h, user, spec.RoleNames);
        const personID = spec.HasPerson ? await ensurePerson(h, spec, user) : null;
        const apiKey = await ensureKey(h, user, previous?.Personas.find((p) => p.Key === spec.Key));
        records.push({ Key: spec.Key, Email: user.Email, UserID: user.ID, PersonID: personID, APIKey: apiKey });
        console.log(`  ${spec.Key.padEnd(15)} ${user.Email.padEnd(34)} roles=[${spec.RoleNames.join(', ')}] person=${personID ? 'yes' : 'no'} key=ok`);
    }
    WritePersonasFile({ Database: TEST_DATABASE, ProvisionedAt: new Date().toISOString(), Personas: records });
    return records;
}
