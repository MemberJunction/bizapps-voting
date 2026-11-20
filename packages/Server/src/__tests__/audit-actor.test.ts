/**
 * Audit attribution for actions that run as the system principal on an authorized caller's behalf. A voter operation
 * authorizes the caller, then the engines act as the system user; the audit row must still name the caller (an MJ user,
 * or for a guest ballot session the roll entry its signed scope is bound to). No database is reached.
 */

import { describe, it, expect, vi } from 'vitest';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-00000000aaaa';
vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: { Instance: { GetSystemUser: () => ({ ID: SYSTEM_USER_ID, Name: 'System' }) } },
}));
vi.mock('@memberjunction/server', () => ({ VerifyHostAssertion: () => null, BuildSessionClaims: () => ({}), MagicLinkKeyManager: class {}, configInfo: {} }));

import type { UserInfo } from '@memberjunction/core';
import { ActorIdFor, ActorOf, AuditDetails, ElectionAudit, SystemContext, VoterIdentityResolver, type VotingContext } from '../shared/index.js';
import { EngineContextAfterAuthorization } from '../operations/operation-support.js';

const ELECTION = '11111111-1111-1111-1111-111111111111';
const VOTER = '22222222-2222-2222-2222-222222222222';
const MEMBER_ID = '33333333-3333-3333-3333-333333333333';

const member = (id: string): UserInfo => ({ ID: id, UserRoles: [] }) as unknown as UserInfo;
const guest = (resource: string): UserInfo =>
    ({ ID: 'guest-user', IsMagicLinkAnonymous: true, MagicLinkScope: { ResourceType: VoterIdentityResolver.GuestResourceType, ResourceID: resource } }) as unknown as UserInfo;
const system = (): UserInfo => member(SYSTEM_USER_ID);

interface SavedAuditRow {
    ElectionID?: string;
    EventType?: string;
    ActorUserID?: string | null;
    Details?: string | null;
}

/** A provider whose GetEntityObject hands out an audit row that records what was saved, and under which user. */
function auditProvider(): { Provider: VotingContext['Provider']; Saved: SavedAuditRow[]; SavedAs: Array<string | undefined> } {
    const saved: SavedAuditRow[] = [];
    const savedAs: Array<string | undefined> = [];
    const provider = {
        GetEntityObject: vi.fn(async (_name: string, user?: UserInfo) => {
            const row: SavedAuditRow & { NewRecord(): void; Save(): Promise<boolean>; OccurredAt?: Date } = {
                NewRecord: () => undefined,
                Save: async () => {
                    saved.push({ ElectionID: row.ElectionID, EventType: row.EventType, ActorUserID: row.ActorUserID, Details: row.Details });
                    savedAs.push(user?.ID);
                    return true;
                },
            };
            return row;
        }),
    };
    return { Provider: provider as unknown as VotingContext['Provider'], Saved: saved, SavedAs: savedAs };
}

describe('ActorOf', () => {
    it('names an ordinary MJ user', () => {
        expect(ActorOf(member(MEMBER_ID), SYSTEM_USER_ID)).toEqual({ UserID: MEMBER_ID });
    });
    it('is undefined for the system user and for no user', () => {
        expect(ActorOf(system(), SYSTEM_USER_ID)).toBeUndefined();
        expect(ActorOf(undefined, SYSTEM_USER_ID)).toBeUndefined();
    });
    it('names a guest ballot session by the roll entry its scope is bound to, never by its principal id', () => {
        expect(ActorOf(guest(`${ELECTION}:${VOTER}`), SYSTEM_USER_ID)).toEqual({ GuestEligibleVoterID: VOTER });
    });
    it('is undefined for a guest without a ballot scope', () => {
        expect(ActorOf(guest('not-a-scope'), SYSTEM_USER_ID)).toBeUndefined();
    });
});

describe('SystemContext keeps the authorized caller as the actor', () => {
    it('acts as the system user but remembers the member', () => {
        const ctx = SystemContext({ ContextUser: member(MEMBER_ID), Provider: auditProvider().Provider });
        expect(ctx.ContextUser.ID).toBe(SYSTEM_USER_ID);
        expect(ctx.Actor).toEqual({ UserID: MEMBER_ID });
    });
    it('keeps an existing actor when a system context is re-derived', () => {
        const once = SystemContext({ ContextUser: member(MEMBER_ID), Provider: auditProvider().Provider });
        expect(SystemContext(once).Actor).toEqual({ UserID: MEMBER_ID });
    });
    it('has no actor when the system user itself acts (jobs, the edge)', () => {
        expect(SystemContext({ ContextUser: system(), Provider: auditProvider().Provider }).Actor).toBeUndefined();
    });
    it('EngineContextAfterAuthorization carries the caller too', () => {
        expect(EngineContextAfterAuthorization({ ContextUser: member(MEMBER_ID), Provider: auditProvider().Provider }).Actor).toEqual({ UserID: MEMBER_ID });
    });
});

describe('ActorIdFor / AuditDetails', () => {
    it('a system context for a member names the member', () => {
        expect(ActorIdFor({ ContextUser: system(), Provider: auditProvider().Provider, Actor: { UserID: MEMBER_ID } })).toBe(MEMBER_ID);
    });
    it('the plain system user and a guest name no MJ user', () => {
        expect(ActorIdFor({ ContextUser: system(), Provider: auditProvider().Provider })).toBeNull();
        expect(ActorIdFor({ ContextUser: system(), Provider: auditProvider().Provider, Actor: { GuestEligibleVoterID: VOTER } })).toBeNull();
    });
    it('a guest is recorded in the payload by roll entry', () => {
        const json = AuditDetails({ ContextUser: system(), Provider: auditProvider().Provider, Actor: { GuestEligibleVoterID: VOTER } }, { Count: 1 });
        expect(JSON.parse(json ?? '{}')).toEqual({ Count: 1, ActorEligibleVoterID: VOTER });
    });
    it('no details and no guest stays null', () => {
        expect(AuditDetails({ ContextUser: system(), Provider: auditProvider().Provider })).toBeNull();
    });
});

describe('ElectionAudit.Record from a voter operation', () => {
    it('writes the row as the system user and names the authorized member as the actor', async () => {
        const { Provider, Saved, SavedAs } = auditProvider();
        const engineCtx = SystemContext({ ContextUser: member(MEMBER_ID), Provider });
        await ElectionAudit.Record(engineCtx, ELECTION, 'ProxyDesignated', { ProxyDesignationID: 'p-1', Scope: 'General' });
        expect(SavedAs).toEqual([SYSTEM_USER_ID]);
        expect(Saved[0].ActorUserID).toBe(MEMBER_ID);
        expect(JSON.parse(Saved[0].Details ?? '{}')).toEqual({ ProxyDesignationID: 'p-1', Scope: 'General' });
    });
    it('a guest session is attributed by its roll entry in the payload', async () => {
        const { Provider, Saved } = auditProvider();
        const engineCtx = SystemContext({ ContextUser: guest(`${ELECTION}:${VOTER}`), Provider });
        await ElectionAudit.Record(engineCtx, ELECTION, 'NominationSubmitted', { ContestID: 'c-1' });
        expect(Saved[0].ActorUserID).toBeNull();
        expect(JSON.parse(Saved[0].Details ?? '{}')).toEqual({ ContestID: 'c-1', ActorEligibleVoterID: VOTER });
    });
});
