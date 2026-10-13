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

/** A trimmed non-empty string, else null. */
export function AsTrimmedString(value: unknown): string | null {
    if (typeof value === 'string') {
        const t = value.trim();
        return t.length > 0 ? t : null;
    }
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return null;
}
