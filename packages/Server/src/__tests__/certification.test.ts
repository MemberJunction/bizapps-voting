import { describe, expect, it } from 'vitest';
import { ComputeBallotSetHash } from '../engines/tally-pipeline.js';
import { RequiredCertifiersOf } from '../engines/results-policy.js';

const b = (id: string, style = 'h', receipt = 'R') => ({ ID: id, BallotStyleHash: style, ReceiptCode: receipt });

describe('BallotSetHash', () => {
    it('is deterministic and order independent', () => {
        const set = [b('B1', 's', 'R1'), b('A2', 's', 'R2'), b('C3', 's', 'R3')];
        expect(ComputeBallotSetHash(set)).toBe(ComputeBallotSetHash([...set].reverse()));
        expect(ComputeBallotSetHash(set)).toMatch(/^[0-9a-f]{64}$/);
    });
    it('ignores GUID casing', () => {
        expect(ComputeBallotSetHash([b('ABCDEF')])).toBe(ComputeBallotSetHash([b('abcdef')]));
    });
    it('changes when a ballot is added, removed or altered', () => {
        const base = [b('1', 's', 'R1'), b('2', 's', 'R2')];
        const h = ComputeBallotSetHash(base);
        expect(ComputeBallotSetHash([...base, b('3')])).not.toBe(h);
        expect(ComputeBallotSetHash(base.slice(1))).not.toBe(h);
        expect(ComputeBallotSetHash([b('1', 's', 'R1'), b('2', 's2', 'R2')])).not.toBe(h);
        expect(ComputeBallotSetHash([b('1', 's', 'R1'), b('2', 's', 'RX')])).not.toBe(h);
    });
    it('hashes an empty set', () => {
        expect(ComputeBallotSetHash([])).toMatch(/^[0-9a-f]{64}$/);
    });
});

describe('RequiredCertifiersOf', () => {
    it('defaults to 1 and accepts positive integers', () => {
        expect(RequiredCertifiersOf({})).toBe(1);
        expect(RequiredCertifiersOf({ RequiredCertifiers: 3 })).toBe(3);
        expect(RequiredCertifiersOf({ RequiredCertifiers: 0 })).toBe(1);
        expect(RequiredCertifiersOf({ RequiredCertifiers: 2.5 })).toBe(1);
        expect(RequiredCertifiersOf({ RequiredCertifiers: '2' })).toBe(1);
    });
});
