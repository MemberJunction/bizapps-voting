/**
 * A small RFC 4180 CSV reader: quoted fields, doubled quotes, commas and line breaks inside quotes, CRLF or LF,
 * a leading byte-order mark. Header names are matched case-insensitively and returned lower-cased.
 */

/** Splits CSV text into rows of fields. Blank lines are skipped. */
export function ParseCsvRows(text: string): string[][] {
    const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    let fieldStarted = false;

    const endField = (): void => {
        row.push(field);
        field = '';
        fieldStarted = false;
    };
    const endRow = (): void => {
        endField();
        if (!(row.length === 1 && row[0].trim() === '')) rows.push(row);
        row = [];
    };

    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (inQuotes) {
            if (ch === '"') {
                if (src[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += ch;
            }
            continue;
        }
        if (ch === '"' && !fieldStarted) {
            inQuotes = true;
            fieldStarted = true;
        } else if (ch === ',') {
            endField();
        } else if (ch === '\r') {
            if (src[i + 1] === '\n') i++;
            endRow();
        } else if (ch === '\n') {
            endRow();
        } else {
            field += ch;
            fieldStarted = true;
        }
    }
    if (fieldStarted || field.length > 0 || row.length > 0) endRow();
    return rows;
}

/** Parses CSV with a header row into objects keyed by the lower-cased, trimmed header. Values are trimmed. */
export function ParseCsvRecords(text: string): Array<Record<string, string>> {
    const rows = ParseCsvRows(text);
    if (rows.length === 0) return [];
    const headers = rows[0].map((h) => h.trim().toLowerCase());
    return rows.slice(1).map((cells) => {
        const record: Record<string, string> = {};
        headers.forEach((header, index) => {
            if (header) record[header] = (cells[index] ?? '').trim();
        });
        return record;
    });
}
