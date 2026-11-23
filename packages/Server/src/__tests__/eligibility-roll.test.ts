import { describe, expect, it } from 'vitest';
import { ParseCsvRecords, ParseCsvRows } from '../eligibility/csv-parse.js';
import { MapEntityRow, ParseEntityQuerySettings, ApplyRecordDate, FieldsOf } from '../eligibility/entity-query-eligibility-source.js';
import { NormalizeInlineRows, RowsFromSettings } from '../eligibility/csv-eligibility-source.js';
import { ComputeRollHash, DedupeRoll } from '../eligibility/roll-utils.js';
import { MergeSettings, ParseJsonObject } from '../eligibility/json-settings.js';
import { type RollEntry } from '../eligibility/roll-types.js';

const P1 = '11111111-1111-1111-1111-111111111111';
const P2 = '22222222-2222-2222-2222-222222222222';
const O1 = 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA';

const entry = (over: Partial<RollEntry> = {}): RollEntry => ({
    PersonID: P1,
    RepresentingOrganizationID: null,
    VotingClass: null,
    Weight: 1,
    SourceKey: null,
    ...over,
});

describe('roll hash', () => {
    it('is deterministic and independent of source order', () => {
        const a = [entry({ PersonID: P1 }), entry({ PersonID: P2, VotingClass: 'Full', Weight: 2 })];
        const b = [a[1], a[0]];
        expect(ComputeRollHash(a)).toBe(ComputeRollHash(b));
        expect(ComputeRollHash(a)).toMatch(/^[0-9a-f]{64}$/);
    });

    it('ignores ID letter case and SourceKey, but changes with class, weight or members', () => {
        const base = ComputeRollHash([entry()]);
        expect(ComputeRollHash([entry({ PersonID: P1.toUpperCase(), SourceKey: 'x' })])).toBe(base);
        expect(ComputeRollHash([entry({ Weight: 2 })])).not.toBe(base);
        expect(ComputeRollHash([entry({ VotingClass: 'A' })])).not.toBe(base);
        expect(ComputeRollHash([entry(), entry({ PersonID: P2 })])).not.toBe(base);
    });
});

describe('roll de-duplication', () => {
    it('collapses the same person and organization, first occurrence wins', () => {
        const result = DedupeRoll([entry({ Weight: 3 }), entry({ PersonID: P1.toUpperCase(), Weight: 9 }), entry({ RepresentingOrganizationID: O1 })]);
        expect(result.Entries).toHaveLength(2);
        expect(result.Duplicates).toBe(1);
        expect(result.Entries[0].Weight).toBe(3);
    });

    it('drops non-positive weights', () => {
        const result = DedupeRoll([entry({ Weight: 0 }), entry({ PersonID: P2, Weight: -1 }), entry({ PersonID: '33333333-3333-3333-3333-333333333333' })]);
        expect(result.Entries).toHaveLength(1);
        expect(result.Dropped).toBe(2);
    });
});

describe('entity-query settings mapping', () => {
    it('applies defaults and requires an entity', () => {
        expect(() => ParseEntityQuerySettings({})).toThrow(/EntityName/);
        const s = ParseEntityQuerySettings({ EntityName: 'Members', VotingClassField: 'Tier', WeightField: 'Shares', SourceKeyField: 'MemberNo', RepresentingOrganizationIDField: 'OrgID' });
        expect(s.PersonIDField).toBe('PersonID');
        expect(FieldsOf(s)).toEqual(['PersonID', 'Tier', 'Shares', 'MemberNo', 'OrgID']);
    });

    it('rejects field names that are not identifiers', () => {
        expect(() => ParseEntityQuerySettings({ EntityName: 'M', PersonIDField: 'ID; DROP TABLE x' })).toThrow(/valid field name/);
    });

    it('maps a row to a roll entry', () => {
        const s = ParseEntityQuerySettings({ EntityName: 'M', VotingClassField: 'Tier', WeightField: 'Shares', SourceKeyField: 'No' });
        const mapped = MapEntityRow({ PersonID: P1, Tier: 'Full', Shares: '2.5', No: 42 }, s);
        expect(mapped).toEqual({ Entry: { PersonID: P1, RepresentingOrganizationID: null, VotingClass: 'Full', Weight: 2.5, SourceKey: '42' } });
    });

    it('defaults a missing weight to 1 and refuses bad ones', () => {
        const s = ParseEntityQuerySettings({ EntityName: 'M', WeightField: 'W' });
        expect(MapEntityRow({ PersonID: P1, W: null }, s)).toMatchObject({ Entry: { Weight: 1 } });
        expect(MapEntityRow({ PersonID: P1, W: 0 }, s)).toHaveProperty('Reason');
        expect(MapEntityRow({ PersonID: P1, W: 'abc' }, s)).toHaveProperty('Reason');
        expect(MapEntityRow({ PersonID: null }, s)).toHaveProperty('Reason');
    });

    it('substitutes the record date in the filter', () => {
        const d = new Date('2026-01-31T00:00:00.000Z');
        expect(ApplyRecordDate("JoinedAt <= {RecordDate}", d)).toBe("JoinedAt <= '2026-01-31T00:00:00.000Z'");
        expect(ApplyRecordDate(null, d)).toBeNull();
    });
});

describe('CSV parsing', () => {
    it('handles quoted fields, escaped quotes, embedded commas and newlines, CRLF and BOM', () => {
        const text = '﻿Email,SourceKey,VotingClass\r\n"a@x.org","K,1","Say ""hi"""\r\nb@x.org,K2,"two\nlines"\r\n\r\n';
        const rows = ParseCsvRows(text);
        expect(rows).toEqual([
            ['Email', 'SourceKey', 'VotingClass'],
            ['a@x.org', 'K,1', 'Say "hi"'],
            ['b@x.org', 'K2', 'two\nlines'],
        ]);
    });

    it('matches headers case-insensitively and trims values', () => {
        const records = ParseCsvRecords('EMAIL , sourcekey,WEIGHT\n a@x.org , K1 , 2 \n');
        expect(records).toEqual([{ email: 'a@x.org', sourcekey: 'K1', weight: '2' }]);
    });

    it('treats a row with fewer cells as empty strings', () => {
        expect(ParseCsvRecords('a,b\n1\n')).toEqual([{ a: '1', b: '' }]);
    });

    it('reads inline rows with any key case, and CsvText', () => {
        expect(NormalizeInlineRows([{ Email: 'A@X.org', WEIGHT: 2 }])).toEqual([{ email: 'A@X.org', weight: '2' }]);
        expect(RowsFromSettings({ CsvText: 'Email\na@x.org' })).toEqual([{ email: 'a@x.org' }]);
        expect(() => RowsFromSettings({})).toThrow();
        expect(() => RowsFromSettings({ FileID: 'abc' })).toThrow(/does not read uploaded files/);
    });
});

describe('settings helpers', () => {
    it('merges election settings over defaults without erasing them with blanks', () => {
        expect(MergeSettings({ A: 1, B: 2 }, { B: '', C: 3, A: 9 })).toEqual({ A: 9, B: 2, C: 3 });
        expect(ParseJsonObject('not json')).toEqual({});
        expect(ParseJsonObject('[1]')).toEqual({});
    });
});
