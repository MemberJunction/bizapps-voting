/**
 * Decision logic factored out of the Remote Operations (vitest): failure hygiene, ballot state, results viewer,
 * credential-method choice.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const logged: string[] = [];
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: (m: string) => void logged.push(m) };
});
vi.mock('@memberjunction/server', () => ({ VerifyHostAssertion: () => null, BuildSessionClaims: () => ({}), MagicLinkKeyManager: class {}, configInfo: {} }));

import type { UserInfo } from '@memberjunction/core';
import {
    BuildResultsViewer,
    ChooseCredentialMethodID,
    DescribeMyBallotState,
    FailOperation,
    GENERIC_FAILURE_MESSAGE,
    HoldsBallotSession,
    MostRecentRedeemedMethodID,
} from '../operations/operation-support.js';

beforeEach(() => {
    logged.length = 0;
});

describe('FailOperation', () => {
    it('never returns the raw exception text', () => {
        const out = FailOperation('Voting.Tally', new Error('secret SQL detail'));
        expect(out).toEqual({ Success: false, Message: GENERIC_FAILURE_MESSAGE });
    });
    it('logs name and message for ordinary operations', () => {
        FailOperation('Voting.Tally', new TypeError('boom'));
        expect(logged[0]).toContain('TypeError');
        expect(logged[0]).toContain('boom');
    });
    it('logs only the error name for ballot/key operations', () => {
        const out = FailOperation('Voting.CastBallot', new Error('selections: OptionX'), { NameOnly: true });
        expect(out.Message).toBe(GENERIC_FAILURE_MESSAGE);
        expect(logged[0]).toContain('Error');
        expect(logged[0]).not.toContain('OptionX');
    });
    it('copes with a thrown non-Error', () => {
        expect(FailOperation('Voting.Tally', 'a string').Message).toBe(GENERIC_FAILURE_MESSAGE);
        expect(logged[0]).toContain('unknown');
    });
});

describe('HoldsBallotSession', () => {
    const guest = (scope: Record<string, string>) => ({ IsMagicLinkAnonymous: true, MagicLinkScope: scope }) as unknown as UserInfo;
    it('passes non-guests', () => expect(HoldsBallotSession({ ID: 'u' } as unknown as UserInfo)).toBe(true));
    it('passes a well-formed ballot session', () => expect(HoldsBallotSession(guest({ ResourceType: 'VotingBallotSession', ResourceID: 'E:V' }))).toBe(true));
    it('refuses other types and malformed ids', () => {
        expect(HoldsBallotSession(guest({ ResourceType: 'Other', ResourceID: 'E:V' }))).toBe(false);
        expect(HoldsBallotSession(guest({ ResourceType: 'VotingBallotSession', ResourceID: 'nope' }))).toBe(false);
    });
});

describe('DescribeMyBallotState', () => {
    it('reports the engine facts and a receipt only when supplied', () => {
        expect(DescribeMyBallotState({ HasVoted: true, CanRevote: true, ReceiptCode: 'AAAA' })).toEqual({ HasVoted: true, CanRevote: true, ReceiptCode: 'AAAA' });
        expect(DescribeMyBallotState({ HasVoted: true, CanRevote: false })).toEqual({ HasVoted: true, CanRevote: false, ReceiptCode: null });
        expect(DescribeMyBallotState({ HasVoted: false, CanRevote: false })).toEqual({ HasVoted: false, CanRevote: false, ReceiptCode: null });
    });
});

describe('BuildResultsViewer', () => {
    const base = { IsAdministrator: false, IsGuest: false, HasUserID: true, Identity: null, HasVoted: false };
    it('a null identity is not eligible and has not voted', () => {
        const v = BuildResultsViewer({ ...base, HasVoted: true });
        expect(v).toMatchObject({ IsEligible: false, HasVoted: false, EligibleVoterID: undefined });
    });
    it('an identity makes the caller eligible and carries the voter id and vote state', () => {
        const v = BuildResultsViewer({ ...base, Identity: { EligibleVoterID: 'V1' }, HasVoted: true });
        expect(v).toMatchObject({ IsEligible: true, HasVoted: true, EligibleVoterID: 'V1' });
    });
    it('host membership approximates "signed-in, non-guest user"', () => {
        expect(BuildResultsViewer(base).IsHostMember).toBe(true);
        expect(BuildResultsViewer({ ...base, IsGuest: true }).IsHostMember).toBe(false);
        expect(BuildResultsViewer({ ...base, HasUserID: false }).IsHostMember).toBe(false);
    });
    it('passes administrator status through', () => expect(BuildResultsViewer({ ...base, IsAdministrator: true }).IsAdministrator).toBe(true));
});

describe('credential method choice', () => {
    const rows = [
        { VoterCredentialMethodID: 'm-old', RedeemedAt: new Date('2026-01-01') },
        { VoterCredentialMethodID: 'm-new', RedeemedAt: '2026-03-01T00:00:00Z' },
        { VoterCredentialMethodID: 'm-unredeemed', RedeemedAt: null },
    ];
    it('picks the most recently redeemed', () => expect(MostRecentRedeemedMethodID(rows)).toBe('m-new'));
    it('is undefined with nothing redeemed', () => {
        expect(MostRecentRedeemedMethodID([])).toBeUndefined();
        expect(MostRecentRedeemedMethodID([{ VoterCredentialMethodID: 'x', RedeemedAt: null }])).toBeUndefined();
    });
    it('an MJ session uses the mj-session method', () => expect(ChooseCredentialMethodID('MJSession', 'mj', rows)).toBe('mj'));
    it('a guest session uses the latest redeemed method', () => expect(ChooseCredentialMethodID('GuestSession', 'mj', rows)).toBe('m-new'));
});
