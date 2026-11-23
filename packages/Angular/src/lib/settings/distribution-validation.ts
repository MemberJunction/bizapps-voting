/**
 * Pure validation and generation helpers for ballot distributions, kept free of Angular so they
 * can be unit tested.
 */

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_SLUGS = ['session', 'element'];

/** Returns an error message, or null when the slug is acceptable. */
export function ValidateSlug(slug: string): string | null {
    if (!slug) {
        return 'A slug is required.';
    }
    if (slug.length > 100) {
        return 'The slug must be 100 characters or fewer.';
    }
    if (!SLUG_PATTERN.test(slug)) {
        return 'Use only lowercase letters, digits and single hyphens, starting and ending with a letter or digit.';
    }
    if (RESERVED_SLUGS.includes(slug)) {
        return `"${slug}" is reserved for a ballot route; choose another slug.`;
    }
    return null;
}

export interface OriginResult {
    Origin: string | null;
    Error: string | null;
}

/** Reduces user input to a bare http(s) origin, rejecting paths, credentials and other schemes. */
export function NormalizeOrigin(input: string): OriginResult {
    const text = input.trim();
    if (!text) {
        return { Origin: null, Error: 'Enter an http or https origin.' };
    }
    let url: URL;
    try {
        url = new URL(text);
    } catch {
        return { Origin: null, Error: 'That is not a valid URL. Use a form like https://www.example.org.' };
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return { Origin: null, Error: 'Only http and https origins are allowed.' };
    }
    if (url.username || url.password) {
        return { Origin: null, Error: 'An origin cannot contain credentials.' };
    }
    if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
        return { Origin: null, Error: 'An origin has no path, query or fragment. Use only scheme, host and port.' };
    }
    return { Origin: url.origin.toLowerCase(), Error: null };
}

/** Parses a JSON string array column; tolerates null, blanks and (like the server) delimited text. */
export function ParseJsonStringArray(text: string | null | undefined): string[] {
    if (!text || !text.trim()) {
        return [];
    }
    const trimmed = text.trim();
    if (trimmed.startsWith('[')) {
        try {
            const parsed: unknown = JSON.parse(trimmed);
            return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : [];
        } catch {
            return [];
        }
    }
    return trimmed.split(/[\s,;]+/).filter(Boolean);
}

const PEM_PATTERN = /^-----BEGIN ([A-Z0-9 ]+)-----\s*([A-Za-z0-9+/=\s]+?)\s*-----END \1-----$/;

/** Basic PEM check: matching BEGIN/END armour around base64 whose length is a multiple of 4. */
export function ValidateHostPublicKey(pem: string, required: boolean): string | null {
    const text = pem.trim();
    if (!text) {
        return required ? 'A host public key is required when the host-assertion sign-in method is allowed.' : null;
    }
    const match = PEM_PATTERN.exec(text);
    if (!match) {
        return 'Not a PEM block. It should start with -----BEGIN PUBLIC KEY----- and end with -----END PUBLIC KEY-----.';
    }
    if (!match[1].includes('PUBLIC KEY') && !match[1].includes('CERTIFICATE')) {
        return 'The PEM block must be a public key or certificate, not a private key.';
    }
    const body = match[2].replace(/\s+/g, '');
    if (body.length < 40 || body.length % 4 !== 0) {
        return 'The key body is not valid base64.';
    }
    return null;
}

/** Theme must be empty or a JSON object. */
export function ValidateTheme(theme: string): string | null {
    const text = theme.trim();
    if (!text) {
        return null;
    }
    try {
        const parsed: unknown = JSON.parse(text);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return 'The theme must be a JSON object.';
        }
        return null;
    } catch (error) {
        return `The theme is not valid JSON: ${error instanceof Error ? error.message : 'parse error'}.`;
    }
}

/** A 128-bit random distribution key, generated with the platform CSPRNG. */
export function GenerateDistributionKey(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return 'dk_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
