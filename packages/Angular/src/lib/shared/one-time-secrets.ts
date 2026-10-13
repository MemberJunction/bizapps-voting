/**
 * Pure helpers for the one-time secrets view (control numbers, second-factor PINs). The values exist only in
 * the component that received them: CSV text is generated here, client-side, and nothing is sent anywhere.
 */

/** A leading character a spreadsheet would read as a formula. */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/**
 * One CSV cell. A cell that could be read as a spreadsheet formula (such as a voter name starting with "=") gets a
 * leading apostrophe, and any cell with a comma, quote or line break is quoted with its quotes doubled.
 */
export function CsvCell(value: string | null | undefined): string {
    let text = value ?? '';
    if (FORMULA_LEAD.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV text (CRLF line breaks, header first) from a header row and data rows. */
export function BuildCsv(header: ReadonlyArray<string>, rows: ReadonlyArray<ReadonlyArray<string | null | undefined>>): string {
    return [header, ...rows].map((r) => r.map(CsvCell).join(',')).join('\r\n') + '\r\n';
}

/** One issued secret with the voter it belongs to, as the results view and the CSV show it. */
export interface IssuedSecretRow {
    Voter: string;
    /** The roster key the voter presents with a PIN; empty for control numbers. */
    SourceKey: string;
    Secret: string;
}

/** CSV for issued control numbers. */
export function ControlNumbersCsv(rows: ReadonlyArray<IssuedSecretRow>): string {
    return BuildCsv(['Voter', 'Control number'], rows.map((r) => [r.Voter, r.Secret]));
}

/** CSV for issued second-factor PINs. */
export function PinsCsv(rows: ReadonlyArray<IssuedSecretRow>): string {
    return BuildCsv(['Voter', 'Roster key', 'PIN'], rows.map((r) => [r.Voter, r.SourceKey, r.Secret]));
}

/** One trustee's key share as shown once after key creation. */
export interface TrusteeShareRow {
    Trustee: string;
    ShareIndex: number;
    Share: string;
}

/** CSV for trustee key shares. */
export function TrusteeSharesCsv(rows: ReadonlyArray<TrusteeShareRow>): string {
    return BuildCsv(['Trustee', 'Share index', 'Share'], rows.map((r) => [r.Trustee, String(r.ShareIndex), r.Share]));
}
