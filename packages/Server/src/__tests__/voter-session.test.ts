/**
 * The voter-operation pattern (operation-support OpenVoterSession): the caller is authorized from verified claims first,
 * the roll is read as the system principal (guests and members hold no grant on it), the engines then run as the system
 * principal, and a caller who is not on the roll is refused with the standard reason.
 *
 * Also verifies V2: signed-in member matching goes through Common's ResolvePersonIDForUser (the user's own People or
 * People-subtype link first, then deprecated People.LinkedUserID, with email fallback only when the user carries no
 * People link), and FindPersonForUser follows the same rule.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-00000000aaaa';
vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: { Instance: { GetSystemUser: () => ({ ID: SYSTEM_USER_ID, Name: 'System' }) } },
}));
vi.mock('@memberjunction/server', () => ({ VerifyHostAssertion: () => null, BuildSessionClaims: () => ({}), MagicLinkKeyManager: class {}, configInfo: {} }));

import type { EntityInfo, UserInfo } from '@memberjunction/core';
import { VoterIdentityResolver, type VotingContext } from '../shared/index.js';
import { FindPersonForUser } from '../engines/person-support.js';
import { EngineContextAfterAuthorization, NOT_ON_ROLL_MESSAGE, OpenVoterSession } from '../operations/operation-support.js';

interface RunViewCall {
    EntityName: string;
    ExtraFilter: string;
    User: string | undefined;
}

const PEOPLE_ENTITY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
const SUBTYPE_ENTITY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2';
const OTHER_ENTITY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3';

const ENTITIES: Record<string, EntityInfo> = {
    [PEOPLE_ENTITY_ID]: { ID: PEOPLE_ENTITY_ID, Name: 'MJ_BizApps_Common: People', ParentChain: [] } as unknown as EntityInfo,
    [SUBTYPE_ENTITY_ID]: {
        ID: SUBTYPE_ENTITY_ID,
        Name: 'Custom: Members',
        ParentChain: [{ ID: PEOPLE_ENTITY_ID, Name: 'MJ_BizApps_Common: People' }],
    } as unknown as EntityInfo,
    [OTHER_ENTITY_ID]: { ID: OTHER_ENTITY_ID, Name: 'MJ: Users', ParentChain: [] } as unknown as EntityInfo,
};

/** A provider whose RunView answers from a table (or callback) and records who asked for what. */
function stubProvider(
    rows: Record<string, Array<Record<string, unknown>>> | ((params: { EntityName: string; ExtraFilter?: string }) => Array<Record<string, unknown>>)
): { Provider: VotingContext['Provider']; Calls: RunViewCall[] } {
    const calls: RunViewCall[] = [];
    const provider = {
        RunView: vi.fn(async (params: { EntityName: string; ExtraFilter?: string }, user?: UserInfo) => {
            calls.push({ EntityName: params.EntityName, ExtraFilter: params.ExtraFilter ?? '', User: user?.ID });
            const matched = typeof rows === 'function' ? rows(params) : (rows[params.EntityName] ?? []);
            return { Success: true, Results: matched };
        }),
        RunViews: vi.fn(),
        EntityByID: vi.fn((id: string) => ENTITIES[id]),
    };
    return { Provider: provider as unknown as VotingContext['Provider'], Calls: calls };
}

const guest = (resource: string): UserInfo =>
    ({ ID: 'guest-user', IsMagicLinkAnonymous: true, MagicLinkScope: { ResourceType: VoterIdentityResolver.GuestResourceType, ResourceID: resource } }) as unknown as UserInfo;
const member = (
    id: string,
    email?: string,
    extra: { LinkedEntityID?: string | null; LinkedEntityRecordID?: string | null } = {}
): UserInfo => ({ ID: id, Email: email, UserRoles: [], ...extra }) as unknown as UserInfo;

const ELECTION = '11111111-1111-1111-1111-111111111111';
const VOTER = '22222222-2222-2222-2222-222222222222';
const MEMBER_USER_ID = '33333333-3333-3333-3333-333333333331';
const PERSON_A = '44444444-4444-4444-4444-444444444441';

beforeEach(() => vi.clearAllMocks());

describe('OpenVoterSession: guest ballot sessions', () => {
    it('opens a session for the voter the signed scope names and runs the engines as the system principal', async () => {
        const { Provider, Calls } = stubProvider({ 'MJ_BizApps_Voting: Eligible Voters': [{ ID: VOTER }] });
        const caller: VotingContext = { ContextUser: guest(`${ELECTION}:${VOTER}`), Provider };
        const session = await OpenVoterSession(ELECTION, caller);
        expect(session?.Identity.EligibleVoterID).toBe(VOTER);
        expect(session?.Identity.Via).toBe('GuestSession');
        expect(session?.Engine.ContextUser.ID).toBe(SYSTEM_USER_ID);
        expect(session?.Engine.Provider).toBe(Provider);
        // The roll check itself ran as the system principal, never as the guest.
        expect(Calls.length).toBeGreaterThan(0);
        for (const call of Calls) expect(call.User).toBe(SYSTEM_USER_ID);
    });

    it('is bound to exactly the scope: another election is refused without reading the roll', async () => {
        const { Provider, Calls } = stubProvider({ 'MJ_BizApps_Voting: Eligible Voters': [{ ID: VOTER }] });
        const other = '33333333-3333-3333-3333-333333333333';
        expect(await OpenVoterSession(other, { ContextUser: guest(`${ELECTION}:${VOTER}`), Provider })).toBeNull();
        expect(Calls).toHaveLength(0);
    });

    it('refuses a guest whose roll entry is gone (the scope alone is not enough)', async () => {
        const { Provider } = stubProvider({ 'MJ_BizApps_Voting: Eligible Voters': [] });
        expect(await OpenVoterSession(ELECTION, { ContextUser: guest(`${ELECTION}:${VOTER}`), Provider })).toBeNull();
    });

    it('filters the roll lookup by the voter AND the election of the scope', async () => {
        const { Provider, Calls } = stubProvider({ 'MJ_BizApps_Voting: Eligible Voters': [{ ID: VOTER }] });
        await OpenVoterSession(ELECTION, { ContextUser: guest(`${ELECTION}:${VOTER}`), Provider });
        const filter = Calls.find((c) => c.EntityName === 'MJ_BizApps_Voting: Eligible Voters')?.ExtraFilter ?? '';
        expect(filter).toContain(`ID = '${VOTER}'`);
        expect(filter).toContain(`ElectionID = '${ELECTION}'`);
        expect(filter).toContain("Status = 'Eligible'");
    });
});

describe('OpenVoterSession: signed-in members (Common ResolvePersonIDForUser)', () => {
    it('matches via the user People link (LinkedEntityID + LinkedEntityRecordID) first, including IS-A subtypes', async () => {
        for (const entityID of [PEOPLE_ENTITY_ID, SUBTYPE_ENTITY_ID]) {
            const { Provider, Calls } = stubProvider({
                'MJ_BizApps_Common: People': [{ ID: PERSON_A }],
                'MJ_BizApps_Voting: Eligible Voters': [{ ID: VOTER }],
            });
            const u = member(MEMBER_USER_ID, 'other@example.org', {
                LinkedEntityID: entityID,
                LinkedEntityRecordID: PERSON_A,
            });
            const session = await OpenVoterSession(ELECTION, { ContextUser: u, Provider });
            expect(session?.Identity).toMatchObject({ EligibleVoterID: VOTER, Via: 'MJSession' });
            expect(session?.Engine.ContextUser.ID).toBe(SYSTEM_USER_ID);
            const people = Calls.find((c) => c.EntityName === 'MJ_BizApps_Common: People');
            expect(people?.ExtraFilter).toBe(`ID = '${PERSON_A}'`);
            expect(people?.ExtraFilter).not.toContain('LinkedUserID');
            for (const call of Calls) expect(call.User).toBe(SYSTEM_USER_ID);
        }
    });

    it('falls back to deprecated People.LinkedUserID when the user has no People link', async () => {
        const { Provider, Calls } = stubProvider({
            'MJ_BizApps_Common: People': [{ ID: PERSON_A }],
            'MJ_BizApps_Voting: Eligible Voters': [{ ID: VOTER }],
        });
        const u = member(MEMBER_USER_ID, undefined, { LinkedEntityID: OTHER_ENTITY_ID, LinkedEntityRecordID: PERSON_A });
        const session = await OpenVoterSession(ELECTION, { ContextUser: u, Provider });
        expect(session?.Identity).toMatchObject({ EligibleVoterID: VOTER, Via: 'MJSession' });
        const people = Calls.find((c) => c.EntityName === 'MJ_BizApps_Common: People');
        expect(people?.ExtraFilter).toContain(`LinkedUserID = '${MEMBER_USER_ID}'`);
        const roll = Calls.find((c) => c.EntityName === 'MJ_BizApps_Voting: Eligible Voters');
        expect(roll?.ExtraFilter).toContain(`PersonID = '${PERSON_A}'`);
        expect(roll?.ExtraFilter).toContain(`ElectionID = '${ELECTION}'`);
    });

    it('refuses a member who is not on the roll', async () => {
        const { Provider } = stubProvider({ 'MJ_BizApps_Common: People': [{ ID: PERSON_A }], 'MJ_BizApps_Voting: Eligible Voters': [] });
        expect(await OpenVoterSession(ELECTION, { ContextUser: member(MEMBER_USER_ID), Provider })).toBeNull();
    });

    it('refuses a member with no Person at all', async () => {
        const { Provider } = stubProvider({});
        expect(await OpenVoterSession(ELECTION, { ContextUser: member(MEMBER_USER_ID), Provider })).toBeNull();
    });

    it('falls back to the email only when no Person is linked to the user', async () => {
        const { Provider, Calls } = stubProvider((params) => {
            if (params.EntityName === 'MJ_BizApps_Common: People' && params.ExtraFilter?.includes('LOWER(Email)')) {
                return [{ ID: PERSON_A }];
            }
            if (params.EntityName === 'MJ_BizApps_Voting: Eligible Voters') return [{ ID: VOTER }];
            return [];
        });
        const session = await OpenVoterSession(ELECTION, { ContextUser: member(MEMBER_USER_ID, "O'Brien@Example.org"), Provider });
        expect(session?.Identity.EligibleVoterID).toBe(VOTER);
        const byEmail = Calls.find((c) => c.ExtraFilter.includes('LOWER(Email)'));
        expect(byEmail?.ExtraFilter).toContain("'o''brien@example.org'");
    });

    it('does not fall back to email when an explicit People link points to a missing Person', async () => {
        const { Provider, Calls } = stubProvider({ 'MJ_BizApps_Common: People': [] });
        const u = member(MEMBER_USER_ID, 'obrien@example.org', {
            LinkedEntityID: PEOPLE_ENTITY_ID,
            LinkedEntityRecordID: PERSON_A,
        });
        expect(await OpenVoterSession(ELECTION, { ContextUser: u, Provider })).toBeNull();
        expect(Calls.some((c) => c.ExtraFilter.includes('LOWER(Email)'))).toBe(false);
    });

    it('FindPersonForUser also resolves via the user People link first', async () => {
        const { Provider, Calls } = stubProvider({
            'MJ_BizApps_Common: People': [{ ID: PERSON_A, DisplayName: 'Alice Voter' }],
        });
        const u = member(MEMBER_USER_ID, 'alice@example.org', {
            LinkedEntityID: SUBTYPE_ENTITY_ID,
            LinkedEntityRecordID: PERSON_A,
        });
        const found = await FindPersonForUser({ ContextUser: u, Provider });
        expect(found).toEqual({ ID: PERSON_A, DisplayName: 'Alice Voter' });
        expect(Calls[0]?.ExtraFilter).toBe(`ID = '${PERSON_A}'`);
    });
});

describe('EngineContextAfterAuthorization and the refusal reason', () => {
    it('keeps the provider and swaps in the system user', () => {
        const { Provider } = stubProvider({});
        const ctx = EngineContextAfterAuthorization({ ContextUser: member(MEMBER_USER_ID), Provider });
        expect(ctx.ContextUser.ID).toBe(SYSTEM_USER_ID);
        expect(ctx.Provider).toBe(Provider);
    });
    it('uses one clear refusal message', () => {
        expect(NOT_ON_ROLL_MESSAGE).toBe('You are not on the roll for this election.');
    });
});
