import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type mjBizAppsVotingBallotDistributionEntity } from '@mj-biz-apps/voting-entities';
import { type RollFinders } from '../credentials/credential-crypto.js';
import { type VotingContext } from '../shared/index.js';

const verify = vi.fn();
const calls: string[] = [];
let keyResult: string[] = [];
let emailResult: string[] = [];

// The real verifier pulls in MJServer; stub it here. Matching is what is under test.
vi.mock('@memberjunction/server', () => ({ VerifyHostAssertion: (...args: unknown[]) => verify(...args) }));
vi.mock('../credentials/roll-lookup.js', () => ({
    CreateRollFinders: (): RollFinders => ({
        BySourceKey: async (k: string) => {
            calls.push(`key:${k}`);
            return keyResult;
        },
        ByEmail: async (e: string) => {
            calls.push(`email:${e}`);
            return emailResult;
        },
    }),
}));

import { HostAssertionCredentialMethod } from '../credentials/host-assertion-credential-method.js';
import { SsoCredentialMethod } from '../credentials/sso-credential-method.js';

const ctx = {} as VotingContext;
const dist = (over: Partial<{ HostPublicKey: string | null; DistributionKey: string }> = {}): mjBizAppsVotingBallotDistributionEntity =>
    ({ HostPublicKey: 'PEM', DistributionKey: 'dist_key', ...over }) as unknown as mjBizAppsVotingBallotDistributionEntity;

beforeEach(() => {
    verify.mockReset();
    calls.length = 0;
    keyResult = [];
    emailResult = [];
});

describe('HostAssertionCredentialMethod', () => {
    const method = new HostAssertionCredentialMethod();

    it('verifies against the distribution key material, never the request', async () => {
        verify.mockReturnValue({ ok: true, Identity: { email: 'A@x.org', hostUserId: 'H1' } });
        keyResult = ['V1'];
        const result = await method.Verify({ Assertion: 'jwt' }, dist(), 'E1', ctx);
        expect(verify).toHaveBeenCalledWith('jwt', 'PEM', 'dist_key');
        expect(result).toEqual({ Success: true, Value: { EligibleVoterID: 'V1' } });
        expect(calls).toEqual(['key:H1']);
    });

    it('matches by host user id first, then email', async () => {
        verify.mockReturnValue({ ok: true, Identity: { email: 'a@x.org', hostUserId: 'H1' } });
        emailResult = ['V2'];
        const result = await method.Verify({ Assertion: 'jwt' }, dist(), 'E1', ctx);
        expect(result).toEqual({ Success: true, Value: { EligibleVoterID: 'V2' } });
        expect(calls).toEqual(['key:H1', 'email:a@x.org']);
    });

    it('fails generically for a bad assertion, a missing key, or someone not on the roll', async () => {
        verify.mockReturnValue({ ok: false });
        expect(await method.Verify({ Assertion: 'jwt' }, dist(), 'E1', ctx)).toMatchObject({ Success: false, Code: 'InvalidCredential' });
        verify.mockClear();
        expect(await method.Verify({ Assertion: 'jwt' }, dist({ HostPublicKey: null }), 'E1', ctx)).toMatchObject({ Success: false, Code: 'InvalidCredential' });
        expect(await method.Verify({}, dist(), 'E1', ctx)).toMatchObject({ Success: false });
        expect(verify).not.toHaveBeenCalled();
        verify.mockReturnValue({ ok: true, Identity: { email: 'nobody@x.org' } });
        expect(await method.Verify({ Assertion: 'jwt' }, dist(), 'E1', ctx)).toMatchObject({ Success: false, Code: 'InvalidCredential' });
    });
});

describe('SsoCredentialMethod', () => {
    const method = new SsoCredentialMethod();

    it('matches the validated identity by external id, then email', async () => {
        emailResult = ['V9'];
        const result = await method.Verify({ ExternalID: 'idp|1', Email: 'a@x.org' }, dist(), 'E1', ctx);
        expect(result).toEqual({ Success: true, Value: { EligibleVoterID: 'V9' } });
        expect(calls).toEqual(['key:idp|1', 'email:a@x.org']);
    });

    it('refuses an empty identity', async () => {
        expect(await method.Verify({}, dist(), 'E1', ctx)).toMatchObject({ Success: false });
    });
});
