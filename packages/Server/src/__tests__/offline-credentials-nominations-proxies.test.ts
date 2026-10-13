import { describe, expect, it, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';

// @memberjunction/server loads the whole API server configuration at import time; nothing under test needs it.
vi.mock('@memberjunction/server', () => ({
    VerifyHostAssertion: () => null,
    BuildSessionClaims: () => ({}),
    MagicLinkKeyManager: class {},
    configInfo: {},
}));

import { CanIssueOfflineCredentials, CountSkipped } from '../engines/credential-engine.js';
import { NominationOpenProblems } from '../engines/election-administration-engine.js';
import { ProxyDecisionProblem } from '../engines/voter-roll-engine.js';
import { CheckProxyForCast } from '../engines/cast-engine.js';
import { IssueControlNumbersOperation } from '../operations/IssueControlNumbersOperation.js';
import { IssueSecondFactorPinsOperation } from '../operations/IssueSecondFactorPinsOperation.js';
import { OpenNominationsOperation } from '../operations/OpenNominationsOperation.js';
import { CloseNominationsOperation } from '../operations/CloseNominationsOperation.js';
import { DecideProxyOperation } from '../operations/DecideProxyOperation.js';

const NOW = new Date('2026-06-01T12:00:00Z');

describe('CanIssueOfflineCredentials', () => {
    it('allows Ready and Open only', () => {
        expect(CanIssueOfflineCredentials('Ready')).toBe(true);
        expect(CanIssueOfflineCredentials('Open')).toBe(true);
        for (const s of ['Draft', 'Nominations', 'Closed', 'Tallied', 'Certified', 'Cancelled']) expect(CanIssueOfflineCredentials(s)).toBe(false);
    });
});

describe('CountSkipped', () => {
    it('is zero when no voters were named', () => {
        expect(CountSkipped(undefined, 5)).toBe(0);
        expect(CountSkipped([], 5)).toBe(0);
    });
    it('counts distinct requested voters that got nothing, case-insensitively', () => {
        expect(CountSkipped(['A', 'a', 'B', 'C'], 2)).toBe(1);
        expect(CountSkipped(['A'], 1)).toBe(0);
        expect(CountSkipped(['A'], 4)).toBe(0);
    });
});

describe('NominationOpenProblems', () => {
    it('is fine with an office contest and no window, or a future close', () => {
        expect(NominationOpenProblems({ OfficeContestCount: 1, NominationsCloseAt: null }, NOW)).toEqual([]);
        expect(NominationOpenProblems({ OfficeContestCount: 2, NominationsCloseAt: '2026-07-01T00:00:00Z' }, NOW)).toEqual([]);
    });
    it('needs an office contest', () => {
        expect(NominationOpenProblems({ OfficeContestCount: 0, NominationsCloseAt: null }, NOW)).toHaveLength(1);
    });
    it('refuses a window that has already closed (including exactly now)', () => {
        expect(NominationOpenProblems({ OfficeContestCount: 1, NominationsCloseAt: '2026-05-01T00:00:00Z' }, NOW)[0]).toMatch(/already closed/);
        expect(NominationOpenProblems({ OfficeContestCount: 1, NominationsCloseAt: NOW }, NOW)).toHaveLength(1);
    });
    it('reports every problem', () => {
        expect(NominationOpenProblems({ OfficeContestCount: 0, NominationsCloseAt: '2026-01-01T00:00:00Z' }, NOW)).toHaveLength(2);
    });
});

describe('ProxyDecisionProblem', () => {
    it('allows deciding a Pending designation before the election closes', () => {
        for (const status of ['Draft', 'Nominations', 'Ready', 'Open']) {
            expect(ProxyDecisionProblem('Pending', status, 'Accepted')).toBeNull();
            expect(ProxyDecisionProblem('Pending', status, 'Rejected')).toBeNull();
        }
    });
    it('refuses once the election has closed', () => {
        for (const status of ['Closed', 'Tallied', 'Certified', 'Cancelled']) {
            expect(ProxyDecisionProblem('Pending', status, 'Accepted')?.Code).toBe('InvalidStatus');
        }
    });
    it('refuses a designation that is not Pending', () => {
        for (const status of ['Accepted', 'Rejected', 'Revoked', 'Used']) {
            expect(ProxyDecisionProblem(status, 'Open', 'Accepted')?.Code).toBe('AlreadyDecided');
        }
    });
    it('refuses an unknown decision', () => {
        expect(ProxyDecisionProblem('Pending', 'Open', 'Used')?.Code).toBe('InvalidDecision');
        expect(ProxyDecisionProblem('Pending', 'Open', '')?.Code).toBe('InvalidDecision');
    });
});

describe('CheckProxyForCast', () => {
    const designation = { Status: 'Accepted', ElectionID: 'E1', GrantorEligibleVoterID: 'V1' };
    it('accepts an Accepted designation of this voter and election, ignoring id case', () => {
        expect(CheckProxyForCast('Proxy', designation, 'E1', 'V1')).toBeNull();
        expect(CheckProxyForCast('Proxy', { ...designation, ElectionID: 'abc', GrantorEligibleVoterID: 'DEF' }, 'ABC', 'def')).toBeNull();
    });
    it('requires a designation on the Proxy channel', () => {
        expect(CheckProxyForCast('Proxy', null, 'E1', 'V1')?.Code).toBe('ProxyRequired');
    });
    it('refuses a designation on any other channel', () => {
        expect(CheckProxyForCast('Paper', designation, 'E1', 'V1')?.Code).toBe('ProxyChannelMismatch');
        expect(CheckProxyForCast('Online', null, 'E1', 'V1')).toBeNull();
    });
    it('refuses another voter or another election', () => {
        expect(CheckProxyForCast('Proxy', designation, 'E1', 'V2')?.Code).toBe('ProxyMismatch');
        expect(CheckProxyForCast('Proxy', designation, 'E2', 'V1')?.Code).toBe('ProxyMismatch');
    });
    it('refuses anything but Accepted, including an already Used designation', () => {
        for (const status of ['Pending', 'Rejected', 'Revoked', 'Used']) {
            expect(CheckProxyForCast('Proxy', { ...designation, Status: status }, 'E1', 'V1')?.Code).toBe('ProxyNotAccepted');
        }
    });
});

function user(props: Record<string, unknown> = {}): UserInfo {
    return { ID: 'u1', Email: 'a@example.com', IsMagicLinkAnonymous: false, UserRoles: [], MagicLinkScope: undefined, ...props } as unknown as UserInfo;
}

describe('new administrator operations: authorization', () => {
    const operations = [
        ['IssueControlNumbers', new IssueControlNumbersOperation(), { ElectionID: 'E1' }],
        ['IssueSecondFactorPins', new IssueSecondFactorPinsOperation(), { ElectionID: 'E1' }],
        ['OpenNominations', new OpenNominationsOperation(), { ElectionID: 'E1' }],
        ['CloseNominations', new CloseNominationsOperation(), { ElectionID: 'E1' }],
        ['DecideProxy', new DecideProxyOperation(), { ProxyDesignationID: 'P1', Decision: 'Accepted' }],
    ] as const;

    for (const [name, op, input] of operations) {
        it(`${name}: allows a Voting Administrator`, async () => {
            expect(await op['Authorize'](input as never, user({ UserRoles: [{ Role: 'Voting Administrator' }] }))).toBe(true);
        });
        it(`${name}: refuses a regular user, a Developer, an Integration user, an inspector and a guest`, async () => {
            expect(await op['Authorize'](input as never, user({ UserRoles: [{ Role: 'Regular User' }] }))).toBe(false);
            expect(await op['Authorize'](input as never, user({ UserRoles: [{ Role: 'Developer' }] }))).toBe(false);
            expect(await op['Authorize'](input as never, user({ UserRoles: [{ Role: 'Integration' }] }))).toBe(false);
            expect(await op['Authorize'](input as never, user({ UserRoles: [{ Role: 'Election Inspector' }] }))).toBe(false);
            expect(await op['Authorize'](input as never, user({ IsMagicLinkAnonymous: true, MagicLinkScope: { ResourceType: 'VotingBallotSession', ResourceID: 'E1:V1' } }))).toBe(false);
        });
    }
});
