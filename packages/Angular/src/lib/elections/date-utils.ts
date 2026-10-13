/**
 * Conversions between ISO timestamps and the `datetime-local` input format.
 */

function Pad(n: number): string {
    return String(n).padStart(2, '0');
}

/** ISO timestamp (or date) -> `YYYY-MM-DDTHH:mm` in the browser's local time; empty when absent or invalid. */
export function ToDateTimeLocal(iso: string | null | undefined): string {
    if (!iso) {
        return '';
    }
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
        return '';
    }
    return `${d.getFullYear()}-${Pad(d.getMonth() + 1)}-${Pad(d.getDate())}T${Pad(d.getHours())}:${Pad(d.getMinutes())}`;
}

/** `datetime-local` value -> ISO timestamp; undefined when blank or invalid. */
export function FromDateTimeLocal(value: string): string | undefined {
    if (!value) {
        return undefined;
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** `date` input value (YYYY-MM-DD) -> ISO timestamp at local midnight; undefined when blank. */
export function FromDateOnly(value: string): string | undefined {
    return value ? FromDateTimeLocal(`${value}T00:00`) : undefined;
}
