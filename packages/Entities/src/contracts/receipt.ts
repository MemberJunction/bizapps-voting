/**
 * Receipt code formatting and validation for ballot receipts.
 * Uses Crockford base32 alphabet for human-friendly codes.
 */

/**
 * Crockford base32 alphabet (0-9, then A-Z without I, L, O, U to avoid confusion).
 * @internal
 */
const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Formats a receipt code from raw bytes using Crockford base32.
 * Takes the first 100 bits (13 bytes, with 4 bits of the 13th byte) and encodes as 20 characters,
 * grouped as XXXX-XXXX-XXXX-XXXX-XXXX.
 *
 * @param bytes - The raw bytes to format (must be at least 13 bytes)
 * @returns A formatted receipt code like "0123-4567-89AB-CDEF-GHIJ"
 * @throws Error if bytes length is less than 13
 */
export function FormatReceiptCode(bytes: Uint8Array): string {
  if (bytes.length < 13) {
    throw new Error(`Receipt code requires at least 13 bytes; got ${bytes.length}`);
  }

  // Encode the first 13 bytes as 20 base32 characters (100 bits = 20 * 5 bits)
  let bits = 0n;
  for (let i = 0; i < 13; i++) {
    bits = (bits << 8n) | BigInt(bytes[i]);
  }

  // Extract 20 groups of 5 bits, from most significant to least
  const chars: string[] = [];
  for (let i = 0; i < 20; i++) {
    const index = Number((bits >> BigInt(95 - i * 5)) & 0x1fn);
    chars.push(CROCKFORD_ALPHABET[index]);
  }

  // Group as XXXX-XXXX-XXXX-XXXX-XXXX
  return chars.slice(0, 4).join('') + '-' +
         chars.slice(4, 8).join('') + '-' +
         chars.slice(8, 12).join('') + '-' +
         chars.slice(12, 16).join('') + '-' +
         chars.slice(16, 20).join('');
}

/**
 * Checks if a string matches the receipt code format.
 *
 * @param s - The string to validate
 * @returns true if the string is a valid receipt code format (XXXX-XXXX-XXXX-XXXX-XXXX)
 */
export function IsReceiptCode(s: string): boolean {
  if (typeof s !== 'string') {
    return false;
  }

  // Must be exactly 24 characters (20 chars + 4 dashes)
  if (s.length !== 24) {
    return false;
  }

  // Check format: XXXX-XXXX-XXXX-XXXX-XXXX
  const pattern = /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/;
  if (!pattern.test(s)) {
    return false;
  }

  // Check that all characters are valid Crockford alphabet
  for (let i = 0; i < s.length; i++) {
    const char = s[i];
    if (char !== '-' && !CROCKFORD_ALPHABET.includes(char)) {
      return false;
    }
  }

  return true;
}

/**
 * Normalizes a receipt code by:
 * - Converting to uppercase
 * - Stripping whitespace
 * - Mapping potentially confused characters (O→0, I/L→1, U→V)
 * - Re-inserting dashes in the correct positions
 *
 * @param s - The receipt code to normalize (may be malformed)
 * @returns Normalized receipt code, or the input if it cannot be normalized
 */
export function NormalizeReceiptCode(s: string): string {
  if (typeof s !== 'string') {
    return s;
  }

  // Convert to uppercase and remove whitespace
  let normalized = s.toUpperCase().replace(/\s+/g, '');

  // Remove any dashes to get just the alphanumeric part
  const digitsOnly = normalized.replace(/-/g, '');

  // Should have 20 characters
  if (digitsOnly.length !== 20) {
    return s; // Can't normalize; return original
  }

  // Map potentially confused characters
  // O and 0 are easily confused, as are I/L and 1, U and V
  const mapped = digitsOnly
    .replace(/O/g, '0')
    .replace(/I/g, '1')
    .replace(/L/g, '1')
    .replace(/U/g, 'V');

  // Verify all characters are in the Crockford alphabet after mapping
  for (const char of mapped) {
    if (!CROCKFORD_ALPHABET.includes(char)) {
      return s; // Invalid character remains after mapping; return original
    }
  }

  // Re-insert dashes
  return mapped.slice(0, 4) + '-' +
         mapped.slice(4, 8) + '-' +
         mapped.slice(8, 12) + '-' +
         mapped.slice(12, 16) + '-' +
         mapped.slice(16, 20);
}
