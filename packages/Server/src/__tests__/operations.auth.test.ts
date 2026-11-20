/**
 * Remote Operations — authorization tests (vitest)
 *
 * Verify authorization decisions:
 * - Guest scope validation for voter ops
 * - Administrator/Inspector role checks for admin ops
 * - Trustee (non-guest) checks for trustee ops
 */

import { describe, it, expect, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';

// @memberjunction/server loads the whole API server configuration at import time; nothing under test needs it.
vi.mock('@memberjunction/server', () => ({
    VerifyHostAssertion: () => null,
    BuildSessionClaims: () => ({}),
    MagicLinkKeyManager: class {},
    configInfo: {},
}));

import { GuestMayAccessElection } from '../shared/index.js';
import { SubmitNominationOperation } from '../operations/SubmitNominationOperation.js';
import { GetResultsOperation } from '../operations/GetResultsOperation.js';
import { VerifyReceiptOperation } from '../operations/VerifyReceiptOperation.js';
import { GetMyBallotOperation } from '../operations/GetMyBallotOperation.js';
import { CastBallotOperation } from '../operations/CastBallotOperation.js';
import { CreateElectionOperation } from '../operations/CreateElectionOperation.js';
import { SubmitKeyShareOperation } from '../operations/SubmitKeyShareOperation.js';

// Mock user factory
function createUser(props: Record<string, unknown> = {}): UserInfo {
    return {
        ID: 'user-id-123',
        FirstName: 'Test',
        LastName: 'User',
        Email: 'test@example.com',
        IsMagicLinkAnonymous: false,
        UserRoles: [],
        MagicLinkScope: undefined,
        ...props,
    } as unknown as UserInfo;
}

const guestFor = (resourceID: string, resourceType = 'VotingBallotSession'): UserInfo =>
    createUser({ IsMagicLinkAnonymous: true, MagicLinkScope: { ResourceType: resourceType, ResourceID: resourceID } });

describe('GuestMayAccessElection', () => {
    it('passes a guest whose ballot-session scope names exactly this election', () => {
        expect(GuestMayAccessElection(guestFor('E1:V1'), 'E1')).toBe(true);
    });
    it('compares election ids case-insensitively (UUIDs)', () => {
        expect(GuestMayAccessElection(guestFor('ABCD:V1'), 'abcd')).toBe(true);
    });
    it('refuses a guest scope of the wrong resource type', () => {
        expect(GuestMayAccessElection(guestFor('E1:V1', 'SomethingElse'), 'E1')).toBe(false);
    });
    it('refuses a guest scoped to another election', () => {
        expect(GuestMayAccessElection(guestFor('E2:V1'), 'E1')).toBe(false);
    });
    it('refuses malformed scopes', () => {
        for (const bad of ['', 'E1', 'E1:', ':V1', 'E1:V1:extra']) expect(GuestMayAccessElection(guestFor(bad), 'E1')).toBe(false);
    });
    it('refuses a guest when no election is named', () => {
        expect(GuestMayAccessElection(guestFor('E1:V1'), undefined)).toBe(false);
    });
    it('refuses a missing user', () => {
        expect(GuestMayAccessElection(undefined, 'E1')).toBe(false);
    });
    it('passes a non-guest (the roll check happens when the voter is resolved)', () => {
        expect(GuestMayAccessElection(createUser(), 'E1')).toBe(true);
    });
});

describe('Remote Operations — Authorization', () => {
    describe('Voter operations (guest-scoped)', () => {
        it('GetMyBallot: allows MJ session user', async () => {
            const op = new GetMyBallotOperation();
            const user = createUser({ UserRoles: [{ Role: 'Regular User' }] });
            const input = { ElectionID: 'election-123' };

            const authorized = await op['Authorize'](input, user);
            expect(authorized).toBe(true);
        });

        it('GetMyBallot: allows guest principal with matching election scope', async () => {
            const op = new GetMyBallotOperation();
            const electionID = 'election-123';
            const voterID = 'voter-456';
            const user = createUser({
                IsMagicLinkAnonymous: true,
                MagicLinkScope: {
                    ResourceType: 'VotingBallotSession',
                    ResourceID: `${electionID}:${voterID}`,
                },
            });
            const input = { ElectionID: electionID };

            const authorized = await op['Authorize'](input, user);
            expect(authorized).toBe(true);
        });

        it('GetMyBallot: refuses guest principal with non-matching election', async () => {
            const op = new GetMyBallotOperation();
            const electionID = 'election-123';
            const voterID = 'voter-456';
            const user = createUser({
                IsMagicLinkAnonymous: true,
                MagicLinkScope: {
                    ResourceType: 'VotingBallotSession',
                    ResourceID: `${electionID}:${voterID}`,
                },
            });
            const input = { ElectionID: 'election-different' };

            const authorized = await op['Authorize'](input, user);
            expect(authorized).toBe(false);
        });

        it('CastBallot: requires guest scope to match election', async () => {
            const op = new CastBallotOperation();
            const electionID = 'election-123';
            const user = createUser({
                IsMagicLinkAnonymous: true,
                MagicLinkScope: {
                    ResourceType: 'VotingBallotSession',
                    ResourceID: `${electionID}:voter-456`,
                },
            });
            const input = {
                ElectionID: electionID,
                BallotStyleHash: 'hash',
                Submission: { Contests: [] },
            };

            const authorized = await op['Authorize'](input, user);
            expect(authorized).toBe(true);
        });
    });

    describe('Other voter operations', () => {
        it('GetResults and VerifyReceipt keep guests inside their own election', async () => {
            for (const op of [new GetResultsOperation(), new VerifyReceiptOperation()]) {
                const input = { ElectionID: 'E1', ReceiptCode: 'x' };
                expect(await op['Authorize'](input, guestFor('E1:V1'))).toBe(true);
                expect(await op['Authorize'](input, guestFor('E2:V1'))).toBe(false);
            }
        });
        it('SubmitNomination: a guest needs a well-formed ballot-session scope (election is checked once the contest is loaded)', async () => {
            const op = new SubmitNominationOperation();
            const input = { ContestID: 'C1', NomineePersonID: 'P1' };
            expect(await op['Authorize'](input, guestFor('E1:V1'))).toBe(true);
            expect(await op['Authorize'](input, guestFor('garbage'))).toBe(false);
            expect(await op['Authorize'](input, guestFor('E1:V1', 'Other'))).toBe(false);
            expect(await op['Authorize'](input, createUser())).toBe(true);
        });
    });

    describe('Administrator operations', () => {
        it('CreateElection: allows Voting Administrator role', async () => {
            const op = new CreateElectionOperation();
            const user = createUser({
                UserRoles: [{ Role: 'Voting Administrator' }],
            });
            const input = {
                ElectionTypeCode: 'motion',
                Name: 'Test Election',
                EligibilitySource: { Code: 'entity-query' },
                Contests: [],
            };

            const authorized = await op['Authorize'](input, user);
            expect(authorized).toBe(true);
        });

        it('CreateElection: refuses the Developer and Integration platform roles (they hold no voting grants)', async () => {
            const op = new CreateElectionOperation();
            const user = createUser({
                UserRoles: [{ Role: 'Developer' }],
            });
            const input = {
                ElectionTypeCode: 'motion',
                Name: 'Test Election',
                EligibilitySource: { Code: 'entity-query' },
                Contests: [],
            };

            const authorized = await op['Authorize'](input, user);
            expect(authorized).toBe(false);
            expect(await op['Authorize'](input, createUser({ UserRoles: [{ Role: 'Integration' }] }))).toBe(false);
        });

        it('CreateElection: refuses regular user', async () => {
            const op = new CreateElectionOperation();
            const user = createUser({
                UserRoles: [{ Role: 'Regular User' }],
            });
            const input = {
                ElectionTypeCode: 'motion',
                Name: 'Test Election',
                EligibilitySource: { Code: 'entity-query' },
                Contests: [],
            };

            const authorized = await op['Authorize'](input, user);
            expect(authorized).toBe(false);
        });
    });

    describe('Trustee operation', () => {
        it('SubmitKeyShare: allows MJ session user (non-guest)', async () => {
            const op = new SubmitKeyShareOperation();
            const user = createUser({
                IsMagicLinkAnonymous: false,
                MagicLinkScope: undefined,
            });
            const input = {
                ElectionID: 'election-123',
                ShareIndex: 0,
                Share: 'share-data',
            };

            const authorized = await op['Authorize'](input, user);
            expect(authorized).toBe(true);
        });

        it('SubmitKeyShare: refuses guest principal', async () => {
            const op = new SubmitKeyShareOperation();
            const user = createUser({
                IsMagicLinkAnonymous: true,
                MagicLinkScope: {
                    ResourceType: 'VotingBallotSession',
                    ResourceID: 'election-123:voter-456',
                },
            });
            const input = {
                ElectionID: 'election-123',
                ShareIndex: 0,
                Share: 'share-data',
            };

            const authorized = await op['Authorize'](input, user);
            expect(authorized).toBe(false);
        });

        it('SubmitKeyShare: refuses scoped principal', async () => {
            const op = new SubmitKeyShareOperation();
            const user = createUser({
                IsMagicLinkAnonymous: false,
                MagicLinkScope: {
                    ResourceType: 'VotingBallotSession',
                    ResourceID: 'election-123:voter-456',
                },
            });
            const input = {
                ElectionID: 'election-123',
                ShareIndex: 0,
                Share: 'share-data',
            };

            const authorized = await op['Authorize'](input, user);
            expect(authorized).toBe(false);
        });
    });
});
