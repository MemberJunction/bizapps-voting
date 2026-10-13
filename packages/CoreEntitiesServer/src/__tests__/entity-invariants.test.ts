/**
 * Tests for the pure decision helpers behind the entity server classes.
 * The state machine and lock rule are tested in @mj-biz-apps/voting-entities; here they are only used.
 */

import { describe, it, expect } from 'vitest';
import {
    ALLOWED_TRANSITIONS,
    CanTransition,
    IsConfigurationLocked,
    VOTING_APP_DEFAULTS,
    ValidateResolvedConfiguration,
    type ElectionStatus,
} from '@mj-biz-apps/voting-entities';
import {
    AsString,
    BuildConfigurationToValidate,
    ComputeCastBallotUpdateViolations,
    ComputeLockedFieldViolations,
    ComputeVoterRollViolations,
    DeriveElectionChangeAction,
    DescribeConfigurationLockRefusal,
    DescribeDistributionCreateRefusal,
    DescribeResultWriteRefusal,
    DescribeVoterDeleteRefusal,
    GetAllowedLockedFieldChanges,
    ParseConfiguration,
} from '../entity-invariants.js';

describe('canonical contracts are used, not re-implemented', () => {
    it('the lock rule and state machine come from voting-entities', () => {
        expect(IsConfigurationLocked('Open')).toBe(true);
        expect(IsConfigurationLocked('Ready')).toBe(false);
        expect(CanTransition('Ready', 'Open')).toBe(true);
        expect(CanTransition('Draft', 'Open')).toBe(false);
        expect(ALLOWED_TRANSITIONS.Certified).toEqual([]);
    });
});

describe('ComputeLockedFieldViolations', () => {
    it('judges nothing while the configuration is unlocked', () => {
        expect(ComputeLockedFieldViolations('Draft', ['Name', 'SecrecyMode'])).toEqual([]);
        expect(ComputeLockedFieldViolations('Ready', ['ElectionPublicKey'])).toEqual([]);
    });

    it('refuses configuration fields once locked', () => {
        expect(ComputeLockedFieldViolations('Open', ['Name', 'Status'])).toEqual(['Name']);
        expect(ComputeLockedFieldViolations('Tallied', ['Name', 'SecrecyMode', 'Configuration'])).toEqual(['Name', 'SecrecyMode', 'Configuration']);
    });

    it('allows Status and ChallengeWindowEndsAt', () => {
        expect(ComputeLockedFieldViolations('Closed', ['Status', 'ChallengeWindowEndsAt'])).toEqual([]);
    });

    it('allows RollHash / RollFrozenAt only when previously null', () => {
        expect(ComputeLockedFieldViolations('Open', ['RollHash', 'RollFrozenAt'])).toEqual([]);
        expect(ComputeLockedFieldViolations('Open', ['RollHash', 'RollFrozenAt'], { RollHash: null, RollFrozenAt: undefined })).toEqual([]);
        expect(ComputeLockedFieldViolations('Open', ['RollHash', 'RollFrozenAt'], { RollHash: 'abc', RollFrozenAt: new Date() })).toEqual(['RollHash', 'RollFrozenAt']);
    });

    it('refuses ElectionPublicKey in every locked status (it may change only before Open)', () => {
        for (const status of ['Open', 'Closed', 'Tallied', 'Certified', 'Cancelled']) {
            expect(ComputeLockedFieldViolations(status, ['ElectionPublicKey'])).toEqual(['ElectionPublicKey']);
        }
    });

    it('ignores system fields', () => {
        expect(ComputeLockedFieldViolations('Closed', ['__mj_UpdatedAt', 'Name'])).toEqual(['Name']);
    });

    it('lists the allowed set', () => {
        const allowed = GetAllowedLockedFieldChanges();
        expect(allowed.has('Status')).toBe(true);
        expect(allowed.has('Name')).toBe(false);
    });
});

describe('DeriveElectionChangeAction', () => {
    it('a new election is a Create whatever its status', () => {
        expect(DeriveElectionChangeAction(null, 'Draft', true)).toBe('Create');
        expect(DeriveElectionChangeAction(null, 'Open', true)).toBe('Create');
    });

    it('maps status changes to their action', () => {
        expect(DeriveElectionChangeAction('Ready', 'Open', false)).toBe('Open');
        expect(DeriveElectionChangeAction('Open', 'Closed', false)).toBe('Close');
        expect(DeriveElectionChangeAction('Draft', 'Cancelled', false)).toBe('Cancel');
        expect(DeriveElectionChangeAction('Closed', 'Tallied', false)).toBe('Tally');
        expect(DeriveElectionChangeAction('Tallied', 'Certified', false)).toBe('Certify');
    });

    it('other changes are an Update', () => {
        expect(DeriveElectionChangeAction('Draft', 'Nominations', false)).toBe('Update');
        expect(DeriveElectionChangeAction('Ready', 'Draft', false)).toBe('Update');
        expect(DeriveElectionChangeAction('Open', 'Open', false)).toBe('Update');
        expect(DeriveElectionChangeAction('Tallied', 'Tallied', false)).toBe('Update');
    });
});

describe('DescribeConfigurationLockRefusal', () => {
    it('is null while the election is unlocked', () => {
        const unlocked: ElectionStatus[] = ['Draft', 'Nominations', 'Ready'];
        for (const s of unlocked) expect(DescribeConfigurationLockRefusal(s, 'a contest', 'create')).toBeNull();
    });

    it('names the thing, the verb and the status once locked', () => {
        const locked: ElectionStatus[] = ['Open', 'Closed', 'Tallied', 'Certified', 'Cancelled'];
        for (const s of locked) {
            const msg = DescribeConfigurationLockRefusal(s, 'a contest', 'delete');
            expect(msg).toContain('delete a contest');
            expect(msg).toContain(s);
        }
    });
});

describe('DescribeDistributionCreateRefusal', () => {
    it('allows a new distribution while the election can still take ballots', () => {
        for (const status of ['Draft', 'Nominations', 'Ready', 'Open'] as ElectionStatus[]) expect(DescribeDistributionCreateRefusal(status)).toBeNull();
    });
    it('refuses one once the election is Closed, Tallied, Certified or Cancelled, naming the status', () => {
        for (const status of ['Closed', 'Tallied', 'Certified', 'Cancelled'] as ElectionStatus[]) {
            const refusal = DescribeDistributionCreateRefusal(status);
            expect(refusal).toContain(status);
            expect(refusal).toContain('no longer accepts ballots');
        }
    });
});

describe('ComputeVoterRollViolations', () => {
    it('judges nothing before the roll is frozen', () => {
        expect(ComputeVoterRollViolations(false, true, false, [])).toEqual([]);
        expect(ComputeVoterRollViolations(false, false, false, ['Weight', 'PersonID'])).toEqual([]);
    });

    it('a new voter on a frozen roll must be AddedAfterFreeze', () => {
        expect(ComputeVoterRollViolations(true, true, true, ['ElectionID'])).toEqual([]);
        const v = ComputeVoterRollViolations(true, true, false, ['ElectionID']);
        expect(v.map((x) => x.Field)).toEqual(['AddedAfterFreeze']);
    });

    it('an existing voter on a frozen roll may change only Status / StatusReason', () => {
        expect(ComputeVoterRollViolations(true, false, false, ['Status', 'StatusReason'])).toEqual([]);
        const v = ComputeVoterRollViolations(true, false, false, ['Status', 'Weight', 'VotingClass', '__mj_UpdatedAt']);
        expect(v.map((x) => x.Field)).toEqual(['Weight', 'VotingClass']);
    });
});

describe('DescribeVoterDeleteRefusal', () => {
    it('refuses only once the roll is frozen', () => {
        expect(DescribeVoterDeleteRefusal(false)).toBeNull();
        expect(DescribeVoterDeleteRefusal(true)).toContain('frozen');
    });
});

describe('ComputeCastBallotUpdateViolations', () => {
    it('has no violations when nothing changed', () => {
        expect(ComputeCastBallotUpdateViolations([], 'Counted', 'Counted')).toEqual([]);
    });

    it('allows Counted to Superseded or Spoiled', () => {
        expect(ComputeCastBallotUpdateViolations(['Status'], 'Counted', 'Superseded')).toEqual([]);
        expect(ComputeCastBallotUpdateViolations(['Status'], 'Counted', 'Spoiled')).toEqual([]);
    });

    it('refuses any other status move', () => {
        expect(ComputeCastBallotUpdateViolations(['Status'], 'Superseded', 'Counted')).toHaveLength(1);
        expect(ComputeCastBallotUpdateViolations(['Status'], 'Spoiled', 'Superseded')).toHaveLength(1);
        expect(ComputeCastBallotUpdateViolations(['Status'], null, 'Spoiled')).toHaveLength(1);
    });

    it('refuses changes to any other field', () => {
        const v = ComputeCastBallotUpdateViolations(['Status', 'Selections', 'ReceiptCode', '__mj_UpdatedAt'], 'Counted', 'Spoiled');
        expect(v.map((x) => x.Field)).toEqual(['Selections', 'ReceiptCode']);
    });
});

describe('DescribeResultWriteRefusal', () => {
    it('requires the tally guard', () => {
        expect(DescribeResultWriteRefusal(false, 'Closed')).toContain('tally engine');
    });

    it('requires a Closed or Tallied election', () => {
        expect(DescribeResultWriteRefusal(true, 'Closed')).toBeNull();
        expect(DescribeResultWriteRefusal(true, 'Tallied')).toBeNull();
        for (const s of ['Draft', 'Open', 'Certified', 'Cancelled'] as ElectionStatus[]) {
            expect(DescribeResultWriteRefusal(true, s)).toContain(s);
        }
        expect(DescribeResultWriteRefusal(true, null)).toContain('unknown');
    });
});

describe('ParseConfiguration', () => {
    it('treats blank as none', () => {
        expect(ParseConfiguration(null, 'x')).toEqual({ Value: undefined, Error: null });
        expect(ParseConfiguration('  ', 'x')).toEqual({ Value: undefined, Error: null });
    });

    it('parses a JSON object', () => {
        expect(ParseConfiguration<{ A: number }>('{"A":1}', 'x').Value).toEqual({ A: 1 });
    });

    it('fails closed on bad JSON or a non-object', () => {
        expect(ParseConfiguration('{oops', 'The config').Error).toContain('The config is not valid JSON');
        expect(ParseConfiguration('[1]', 'The config').Error).toContain('must be a JSON object');
        expect(ParseConfiguration('"s"', 'The config').Error).toContain('must be a JSON object');
    });
});

describe('BuildConfigurationToValidate', () => {
    const columns = {
        SecrecyMode: 'Secret' as const,
        AssuranceTier: 'Standard' as const,
        ResultsTiming: 'AfterClose' as const,
        ResultsAudience: 'Voters' as const,
        ResultsMinCast: 5,
        AllowRevote: false,
        WeightClassMinSize: 5,
    };

    it('is valid for the app defaults', () => {
        const config = BuildConfigurationToValidate(undefined, undefined, columns);
        expect(ValidateResolvedConfiguration(config)).toEqual([]);
    });

    it('lets the election columns win over the configuration JSON', () => {
        const config = BuildConfigurationToValidate({ SecrecyMode: 'Open' }, undefined, columns);
        expect(config.SecrecyMode).toBe('Secret');
        expect(config.GoverningDocumentCitation).toBe(VOTING_APP_DEFAULTS.GoverningDocumentCitation);
    });

    it('reports an inconsistent combination', () => {
        const config = BuildConfigurationToValidate(undefined, undefined, { ...columns, AllowRevote: true });
        expect(ValidateResolvedConfiguration(config)).toHaveLength(1);
        const tier = BuildConfigurationToValidate(undefined, undefined, { ...columns, AssuranceTier: 'Verifiable', ResultsTiming: 'Live' });
        expect(ValidateResolvedConfiguration(tier)).toHaveLength(1);
    });
});

describe('AsString', () => {
    it('returns strings and null for everything else', () => {
        expect(AsString('Open')).toBe('Open');
        expect(AsString(null)).toBeNull();
        expect(AsString(3)).toBeNull();
    });
});
