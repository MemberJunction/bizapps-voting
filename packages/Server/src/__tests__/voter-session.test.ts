/**
 * The voter-operation pattern (operation-support OpenVoterSession): the caller is authorized from verified claims first,
 * the roll is read as the system principal (guests and members hold no grant on it), the engines then run as the system
 * principal, and a caller who is not on the roll is refused with the standard reason. No database is reached: the provider is a stub.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-00000000aaaa';
vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: { Instance: { GetSystemUser: () => ({ ID: SYSTEM_USER_ID, Name: 'System' }) } },
}));
vi.mock('@memberjunction/server', () => ({ VerifyHostAssertion: () => null, BuildSessionClaims: () => ({}), MagicLinkKeyManager: class {}, configInfo: {} }));

import type { UserInfo } from '@memberjunction/core';
import { VoterIdentityResolver, type VotingContext } from '../shared/index.js';
import { EngineContextAfterAuthorization, NOT_ON_ROLL_MESSAGE, OpenVoterSession } from '../operations/operation-support.js';

interface RunViewCall {
    EntityName: string;
    ExtraFilter: string;
    User: string | undefined;
}

/** A provider whose RunView answers from a table of (entity name -> rows) and records who asked for what. */
function stubProvider(rows: Record<string, Array<{ ID: string }>>): { Provider: VotingContext['Provider']; Calls: RunViewCall[] } {
    const calls: RunViewCall[] = [];
    const provider = {
        RunView: vi.fn(async (params: { EntityName: string; ExtraFilter?: string }, user?: UserInfo) => {
            calls.push({ EntityName: params.EntityName, ExtraFilter: params.ExtraFilter ?? '', User: user?.ID });
            return { Success: true, Results: rows[params.EntityName] ?? [] };
        }),
        RunViews: vi.fn(),
    };
    return { Provider: provider as unknown as VotingContext['Provider'], Calls: calls };
}

const guest = (resource: string): UserInfo =>
    ({ ID: 'guest-user', IsMagicLinkAnonymous: true, MagicLinkScope: { ResourceType: VoterIdentityResolver.GuestResourceType, ResourceID: resource } }) as unknown as UserInfo;
const member = (id: string, email?: string): UserInfo => ({ ID: id, Email: email, UserRoles: [] }) as unknown as UserInfo;

const ELECTION = '11111111-1111-1111-1111-111111111111';
const VOTER = '22222222-2222-2222-2222-222222222222';

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

describe('OpenVoterSession: signed-in members', () => {
    it('matches the member to the roll through their Person, reading as the system principal', async () => {
        const { Provider, Calls } = stubProvider({
            'MJ_BizApps_Common: People': [{ ID: 'person-1' }],
            'MJ_BizApps_Voting: Eligible Voters': [{ ID: VOTER }],
        });
        const session = await OpenVoterSession(ELECTION, { ContextUser: member('member-1'), Provider });
        expect(session?.Identity).toMatchObject({ EligibleVoterID: VOTER, Via: 'MJSession' });
        expect(session?.Engine.ContextUser.ID).toBe(SYSTEM_USER_ID);
        const people = Calls.find((c) => c.EntityName === 'MJ_BizApps_Common: People');
        expect(people?.ExtraFilter).toContain("LinkedUserID = 'member-1'");
        for (const call of Calls) expect(call.User).toBe(SYSTEM_USER_ID);
        const roll = Calls.find((c) => c.EntityName === 'MJ_BizApps_Voting: Eligible Voters');
        expect(roll?.ExtraFilter).toContain("PersonID = 'person-1'");
        expect(roll?.ExtraFilter).toContain(`ElectionID = '${ELECTION}'`);
    });

    it('refuses a member who is not on the roll', async () => {
        const { Provider } = stubProvider({ 'MJ_BizApps_Common: People': [{ ID: 'person-1' }], 'MJ_BizApps_Voting: Eligible Voters': [] });
        expect(await OpenVoterSession(ELECTION, { ContextUser: member('member-1'), Provider })).toBeNull();
    });

    it('refuses a member with no Person at all', async () => {
        const { Provider } = stubProvider({});
        expect(await OpenVoterSession(ELECTION, { ContextUser: member('member-1'), Provider })).toBeNull();
    });

    it('falls back to the email only when no Person is linked to the user', async () => {
        const { Provider, Calls } = stubProvider({ 'MJ_BizApps_Voting: Eligible Voters': [{ ID: VOTER }] });
        await OpenVoterSession(ELECTION, { ContextUser: member('member-1', "O'Brien@Example.org"), Provider });
        const byEmail = Calls.find((c) => c.ExtraFilter.includes('LOWER(Email)'));
        expect(byEmail?.ExtraFilter).toContain("'o''brien@example.org'");
    });
});

describe('EngineContextAfterAuthorization and the refusal reason', () => {
    it('keeps the provider and swaps in the system user', () => {
        const { Provider } = stubProvider({});
        const ctx = EngineContextAfterAuthorization({ ContextUser: member('m'), Provider });
        expect(ctx.ContextUser.ID).toBe(SYSTEM_USER_ID);
        expect(ctx.Provider).toBe(Provider);
    });
    it('uses one clear refusal message', () => {
        expect(NOT_ON_ROLL_MESSAGE).toBe('You are not on the roll for this election.');
    });
});
