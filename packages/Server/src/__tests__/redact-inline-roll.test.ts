import { describe, it, expect } from 'vitest';
import { RedactInlineRoll } from '../eligibility/json-settings.js';

describe('RedactInlineRoll', () => {
    it('removes inline CSV rows and marks the settings', () => {
        const out = JSON.parse(RedactInlineRoll(JSON.stringify({ CsvText: 'Email\na@b.c', Delimiter: ',', Foo: 1 })) ?? '{}');
        expect(out).toEqual({ Delimiter: ',', Foo: 1, InlineRollRedactedAtFreeze: true });
    });
    it('removes inline Rows objects', () => {
        const out = JSON.parse(RedactInlineRoll(JSON.stringify({ Rows: [{ Email: 'a@b.c' }] })) ?? '{}');
        expect(out).toEqual({ InlineRollRedactedAtFreeze: true });
        expect(JSON.stringify(out)).not.toContain('a@b.c');
    });
    it('leaves settings with no inline roll untouched (same string)', () => {
        const s = JSON.stringify({ EntityName: 'People', Filter: 'x' });
        expect(RedactInlineRoll(s)).toBe(s);
    });
    it('passes null, empty and non-object values through', () => {
        expect(RedactInlineRoll(null)).toBeNull();
        expect(RedactInlineRoll(undefined)).toBeNull();
        expect(RedactInlineRoll('')).toBe('');
        expect(RedactInlineRoll('[1,2]')).toBe('[1,2]');
        expect(RedactInlineRoll('not json')).toBe('not json');
    });
});
