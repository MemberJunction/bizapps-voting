/**
 * Safe parsing of the JSON settings columns (Election.EligibilitySourceSettings, method Configuration).
 */

import { createHash } from 'node:crypto';

export type JsonObject = Record<string, unknown>;

/** Parses a JSON object column. Null, empty, malformed or non-object values give an empty object. */
export function ParseJsonObject(text: string | null | undefined): JsonObject {
    if (!text || !text.trim()) return {};
    try {
        const parsed: unknown = JSON.parse(text);
        return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as JsonObject) : {};
    } catch {
        return {};
    }
}

/** Election-level settings win over the source type's defaults; empty-string and null election values do not erase a default. */
export function MergeSettings(defaults: JsonObject, overrides: JsonObject): JsonObject {
    const merged: JsonObject = { ...defaults };
    for (const [key, value] of Object.entries(overrides)) {
        if (value === null || value === undefined || value === '') continue;
        merged[key] = value;
    }
    return merged;
}

/**
 * What stays of an election's eligibility source settings once the roll is frozen. The settings say how to find the roll
 * (an inline CSV of voters' emails, an entity name and filter that reveal selection criteria, a third-party source's
 * keys). Nothing reads them after the freeze (the roll then lives in Eligible Voters, closed to ordinary users, and a roll
 * is frozen once), but the election row is readable by every signed-in member from then on. So the freeze replaces them
 * with a marker and the SHA-256 of the settings that were used, which an administrator holding the original can check;
 * the same digest is written to the RollFrozen audit event. Null or blank settings stay null.
 */
export function RedactSourceSettingsAtFreeze(settingsJson: string | null | undefined): string | null {
    if (!settingsJson || !settingsJson.trim()) return null;
    return JSON.stringify({ SettingsRedactedAtFreeze: true, SettingsSha256: SourceSettingsDigest(settingsJson) });
}

/** SHA-256 (hex) of the settings text exactly as stored before the freeze. */
export function SourceSettingsDigest(settingsJson: string): string {
    return createHash('sha256').update(settingsJson, 'utf8').digest('hex');
}

/** A trimmed non-empty string, else null. */
export function AsTrimmedString(value: unknown): string | null {
    if (typeof value === 'string') {
        const t = value.trim();
        return t.length > 0 ? t : null;
    }
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return null;
}
