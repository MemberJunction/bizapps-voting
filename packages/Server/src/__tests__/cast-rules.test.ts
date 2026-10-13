import { describe, expect, it } from 'vitest';
import { IsReceiptCode, type BallotStyle, type BallotSubmission, ValidateSubmission } from '@mj-biz-apps/voting-entities';
import {
    CheckElectionWindow,
    CheckStyleHash,
    DecideCastKind,
    GenerateReceiptCode,
    IsUniqueViolation,
    MaintainsRunningTally,
    MergeTallyDeltas,
    NeedsAttribution,
    PlanTallyDeltas,
    SummarizeIssues,
} from '../engines/cast-engine.js';

const t = (s: string): Date => new Date(s);

describe('CheckElectionWindow', () => {
    const opens = t('2026-01-01T00:00:00Z');
    const closes = t('2026-02-01T00:00:00Z');
    it('requires Open status', () => {
        expect(CheckElectionWindow('Draft', null, null, t('2026-01-15T00:00:00Z'))?.Code).toBe('ElectionNotOpen');
        expect(CheckElectionWindow('Closed', null, null, t('2026-01-15T00:00:00Z'))?.Code).toBe('ElectionNotOpen');
    });
    it('is inclusive of OpensAt and exclusive of ClosesAt', () => {
        expect(CheckElectionWindow('Open', opens, closes, opens)).toBeNull();
        expect(CheckElectionWindow('Open', opens, closes, t('2025-12-31T23:59:59Z'))?.Code).toBe('NotYetOpen');
        expect(CheckElectionWindow('Open', opens, closes, closes)?.Code).toBe('VotingClosed');
    });
    it('treats null bounds as unbounded', () => {
        expect(CheckElectionWindow('Open', null, null, t('2030-01-01T00:00:00Z'))).toBeNull();
    });
});

describe('CheckStyleHash / SummarizeIssues', () => {
    it('flags a hash mismatch', () => {
        expect(CheckStyleHash('a', 'a')).toBeNull();
        expect(CheckStyleHash('a', 'b')?.Code).toBe('BallotStyleChanged');
    });
    it('names codes and contests but nothing else', () => {
        expect(SummarizeIssues([])).toBeNull();
        const f = SummarizeIssues([{ ContestID: 'c1', Code: 'TooManySelections', Message: 'secret text' }, { Code: 'X', Message: 'm' }]);
        expect(f?.Code).toBe('InvalidSubmission');
        expect(f?.Message).toContain('TooManySelections (contest c1)');
        expect(f?.Message).not.toContain('secret text');
    });
});

describe('revote rules', () => {
    it('first vote', () => expect(DecideCastKind({ HasParticipation: false, AllowRevote: false, SecrecyMode: 'Secret' }).Kind).toBe('First'));
    it('second vote refused when revote is off', () =>
        expect(DecideCastKind({ HasParticipation: true, AllowRevote: false, SecrecyMode: 'Open' }).Kind).toBe('AlreadyVoted'));
    it('revote allowed for Open and Confidential', () => {
        expect(DecideCastKind({ HasParticipation: true, AllowRevote: true, SecrecyMode: 'Open' }).Kind).toBe('Revote');
        expect(DecideCastKind({ HasParticipation: true, AllowRevote: true, SecrecyMode: 'Confidential' }).Kind).toBe('Revote');
    });
    it('never for Secret, even if the flag is set', () =>
        expect(DecideCastKind({ HasParticipation: true, AllowRevote: true, SecrecyMode: 'Secret' }).Kind).toBe('AlreadyVoted'));
});

describe('attribution and running tally policy', () => {
    it('attribution only when not Secret', () => {
        expect(NeedsAttribution('Secret')).toBe(false);
        expect(NeedsAttribution('Open')).toBe(true);
        expect(NeedsAttribution('Confidential')).toBe(true);
    });
    it('running tally only when results show while open, tier A only', () => {
        expect(MaintainsRunningTally('AfterClose', 'Standard')).toBe(false);
        expect(MaintainsRunningTally('Live', 'Standard')).toBe(true);
        expect(MaintainsRunningTally('AfterVoting', 'Standard')).toBe(true);
        expect(MaintainsRunningTally('Live', 'HighAssurance')).toBe(false);
    });
});

const style: BallotStyle = {
    ElectionID: 'e', ElectionName: 'E', SecrecyMode: 'Open', AllowRevote: true, Language: 'en', Hash: 'h',
    Contests: [
        { ContestID: 'plain', Name: 'P', Kind: 'Office', Seats: 1, IsRanked: false, AllowAbstain: true, AllowWriteIn: false, MinSelections: 0, MaxSelections: 2,
          Options: [{ OptionID: 'a', Label: 'A', IsWriteIn: false }, { OptionID: 'b', Label: 'B', IsWriteIn: false }] },
        { ContestID: 'ranked', Name: 'R', Kind: 'Office', Seats: 1, IsRanked: true, AllowAbstain: false, AllowWriteIn: false, MinSelections: 1, MaxSelections: 3,
          Options: [{ OptionID: 'x', Label: 'X', IsWriteIn: false }, { OptionID: 'y', Label: 'Y', IsWriteIn: false }, { OptionID: 'z', Label: 'Z', IsWriteIn: false }] },
    ],
};

describe('PlanTallyDeltas', () => {
    const sub: BallotSubmission = {
        Contests: [
            { ContestID: 'plain', Selections: [{ OptionID: 'a' }, { OptionID: 'b' }] },
            { ContestID: 'ranked', Selections: [{ OptionID: 'y', Rank: 1 }, { OptionID: 'x', Rank: 2 }, { OptionID: 'z', Rank: 3 }] },
        ],
    };
    it('counts each selection, but only first preferences for ranked contests', () => {
        const d = PlanTallyDeltas(style, sub, 2, 1);
        expect(d).toEqual([
            { ContestID: 'plain', OptionID: 'a', Delta: 2 },
            { ContestID: 'plain', OptionID: 'b', Delta: 2 },
            { ContestID: 'ranked', OptionID: 'y', Delta: 2 },
        ]);
    });
    it('counts abstentions under a null option', () => {
        const d = PlanTallyDeltas(style, { Contests: [{ ContestID: 'plain', Abstain: true, Selections: [] }] }, 1, 1);
        expect(d).toEqual([{ ContestID: 'plain', OptionID: null, Delta: 1 }]);
    });
    it('a revote nets the old ballot out and the new one in', () => {
        const old = PlanTallyDeltas(style, sub, 1, -1);
        const next = PlanTallyDeltas(style, { Contests: [{ ContestID: 'plain', Selections: [{ OptionID: 'a' }] }, { ContestID: 'ranked', Selections: [{ OptionID: 'y', Rank: 1 }] }] }, 1, 1);
        const net = MergeTallyDeltas(old, next);
        expect(net).toEqual([{ ContestID: 'plain', OptionID: 'b', Delta: -1 }]);
    });
});

describe('receipts and uniqueness detection', () => {
    it('generates 20-char Crockford codes grouped 4-4-4-4-4', () => {
        for (let i = 0; i < 20; i++) {
            const code = GenerateReceiptCode();
            expect(IsReceiptCode(code)).toBe(true);
            expect(code.replace(/-/g, '')).toHaveLength(20);
            expect(code.split('-').map((g) => g.length)).toEqual([4, 4, 4, 4, 4]);
        }
        expect(new Set(Array.from({ length: 50 }, GenerateReceiptCode)).size).toBe(50);
    });
    it('recognizes a unique-constraint failure', () => {
        expect(IsUniqueViolation('Violation of UNIQUE KEY constraint UQ_Participation_Election_Voter')).toBe(true);
        expect(IsUniqueViolation('Timeout')).toBe(false);
        expect(IsUniqueViolation(undefined)).toBe(false);
    });
});

describe('validation integrates', () => {
    it('a valid submission has no issues; an invalid one is summarized', () => {
        const ok: BallotSubmission = { Contests: [{ ContestID: 'plain', Selections: [{ OptionID: 'a' }] }, { ContestID: 'ranked', Selections: [{ OptionID: 'x', Rank: 1 }] }] };
        expect(ValidateSubmission(style, ok)).toEqual([]);
        const bad: BallotSubmission = { Contests: [{ ContestID: 'nope', Selections: [] }] };
        expect(SummarizeIssues(ValidateSubmission(style, bad))?.Code).toBe('InvalidSubmission');
    });
});
