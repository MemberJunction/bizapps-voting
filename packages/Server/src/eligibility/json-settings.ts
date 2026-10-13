/**
 * Safe parsing of the JSON settings columns (Election.EligibilitySourceSettings, method Configuration).
 */

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

/** Settings keys that carry the roll itself (voters' emails and keys) rather than how to find it. */
export const INLINE_ROLL_KEYS: ReadonlyArray<string> = ['Rows', 'CsvText'];

/**
 * The election's eligibility source settings with any inline roll data removed, for storing once the roll is frozen: the frozen
 * roll lives in Eligible Voters (closed to ordinary users), while the election row is readable by every signed-in user, so the
 * emails a CSV source was given must not stay on it. Marks the settings so the removal is visible. Returns the input unchanged
 * when it carries no inline roll (or is not a JSON object).
 */
export function RedactInlineRoll(settingsJson: string | null | undefined): string | null {
    if (!settingsJson || !settingsJson.trim()) return settingsJson ?? null;
    const parsed = ParseJsonObject(settingsJson);
    const present = INLINE_ROLL_KEYS.filter((k) => k in parsed);
    if (present.length === 0) return settingsJson;
    const kept: JsonObject = {};
    for (const [key, value] of Object.entries(parsed)) if (!INLINE_ROLL_KEYS.includes(key)) kept[key] = value;
    kept.InlineRollRedactedAtFreeze = true;
    return JSON.stringify(kept);
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
