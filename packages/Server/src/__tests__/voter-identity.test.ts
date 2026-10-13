import { describe, expect, it } from 'vitest';
import { type UserInfo } from '@memberjunction/core';
import { ParseGuestResource, SqlLiteral, VoterIdentityResolver, type VotingContext } from '../shared/index.js';

const guestCtx = (scope: { ResourceType?: string; ResourceID?: string }): VotingContext =>
    ({ ContextUser: { ID: 'u', MagicLinkScope: scope } as unknown as UserInfo, Provider: {} as VotingContext['Provider'] });

describe('guest resource encoding', () => {
    it('round-trips', () => {
        const enc = VoterIdentityResolver.EncodeGuestResource('E-1', 'V-2');
        expect(enc).toBe('E-1:V-2');
        expect(ParseGuestResource(enc)).toEqual({ ElectionID: 'E-1', EligibleVoterID: 'V-2' });
    });
    it('rejects malformed resources', () => {
        for (const bad of [undefined, null, '', 'nocolon', ':v', 'e:', 'a:b:c']) expect(ParseGuestResource(bad)).toBeNull();
    });
});

describe('VoterIdentityResolver.Resolve (guest scope checks, no database reached)', () => {
    it('rejects a scope of the wrong resource type', async () => {
        expect(await VoterIdentityResolver.Resolve('E1', guestCtx({ ResourceType: 'Other', ResourceID: 'E1:V1' }))).toBeNull();
    });
    it('rejects a scope for a different election', async () => {
        const scope = { ResourceType: VoterIdentityResolver.GuestResourceType, ResourceID: VoterIdentityResolver.EncodeGuestResource('E2', 'V1') };
        expect(await VoterIdentityResolver.Resolve('E1', guestCtx(scope))).toBeNull();
    });
    it('rejects an unparsable resource id', async () => {
        const scope = { ResourceType: VoterIdentityResolver.GuestResourceType, ResourceID: 'garbage' };
        expect(await VoterIdentityResolver.Resolve('E1', guestCtx(scope))).toBeNull();
    });
});

describe('SqlLiteral', () => {
    it('escapes quotes', () => expect(SqlLiteral("o'brien")).toBe("'o''brien'"));
});
