import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { RedactSourceSettingsAtFreeze, SourceSettingsDigest } from '../eligibility/json-settings.js';

const sha = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

describe('RedactSourceSettingsAtFreeze', () => {
    it('keeps nothing of an inline CSV roll but a marker and the digest', () => {
        const settings = JSON.stringify({ CsvText: 'Email\na@b.c', Delimiter: ',' });
        const out = RedactSourceSettingsAtFreeze(settings) ?? '';
        expect(JSON.parse(out)).toEqual({ SettingsRedactedAtFreeze: true, SettingsSha256: sha(settings) });
        expect(out).not.toContain('a@b.c');
    });

    it('drops an entity-query source too: its entity, filter and field names reveal how voters were selected', () => {
        const settings = JSON.stringify({ EntityName: 'Members', ExtraFilter: "DuesStatus = 'Paid' AND Region = 'North'", PersonIDField: 'PersonID' });
        const out = RedactSourceSettingsAtFreeze(settings) ?? '';
        for (const leak of ['Members', 'DuesStatus', 'North', 'PersonIDField']) expect(out).not.toContain(leak);
        expect(JSON.parse(out).SettingsRedactedAtFreeze).toBe(true);
    });

    it('drops any key a third-party source might keep (keys, tokens), whatever its name', () => {
        const out = RedactSourceSettingsAtFreeze(JSON.stringify({ ApiKey: 'sk_live_123', Endpoint: 'https://example.invalid/roster' })) ?? '';
        expect(out).not.toContain('sk_live_123');
        expect(out).not.toContain('example.invalid');
    });

    it('records the digest of the exact stored text, so an administrator can match it to the original', () => {
        expect(SourceSettingsDigest('{"Rows":[]}')).toBe(sha('{"Rows":[]}'));
        expect(SourceSettingsDigest('{"Rows":[]}')).toMatch(/^[0-9a-f]{64}$/);
    });

    it('leaves absent settings absent', () => {
        expect(RedactSourceSettingsAtFreeze(null)).toBeNull();
        expect(RedactSourceSettingsAtFreeze(undefined)).toBeNull();
        expect(RedactSourceSettingsAtFreeze('   ')).toBeNull();
    });
});
