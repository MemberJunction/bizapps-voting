/**
 * Hash utilities for ballot validation and receipt generation.
 * Pure TypeScript implementations of SHA-256 and JSON canonicalization,
 * compatible with browser and Node.js environments.
 */

/**
 * Computes the SHA-256 hash of a UTF-8 encoded string.
 * Uses the Secure Hash Algorithm 2 (256-bit) with pure TypeScript,
 * compatible with browser TextEncoder and Node.js.
 *
 * @param input - The string to hash (UTF-8 encoded)
 * @returns Lowercase hexadecimal representation of the hash
 */
export function Sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  return sha256(bytes);
}

/**
 * Canonicalizes a JavaScript value to JSON for hashing.
 * Ensures deterministic output by:
 * - Sorting object keys recursively
 * - Maintaining array order
 * - Omitting undefined properties
 * - Using no whitespace
 *
 * @param value - The value to canonicalize
 * @returns Canonical JSON string suitable for hashing
 */
export function CanonicalJSON(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/**
 * Computes the SHA-256 hash of a ballot style for validation.
 * The hash is computed over everything except the Hash field itself.
 *
 * @param style - The ballot style object (without Hash field)
 * @returns Lowercase hexadecimal SHA-256 hash of the canonical JSON representation
 */
export function ComputeBallotStyleHash(
  style: {
    ElectionID: string;
    ElectionName: string;
    Description?: string;
    ClosesAt?: string;
    SecrecyMode: string;
    AllowRevote: boolean;
    Language: string;
    Contests: unknown[];
  }
): string {
  const canonical = CanonicalJSON(style);
  return Sha256Hex(canonical);
}

/**
 * Recursively canonicalizes a value for deterministic JSON serialization.
 * @internal
 */
function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(v => canonicalize(v));
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const v = obj[key];
    if (v !== undefined) {
      result[key] = canonicalize(v);
    }
  }
  return result;
}

/**
 * SHA-256 implementation for UTF-8 encoded bytes.
 * Based on the NIST FIPS 180-4 specification.
 * @internal
 */
function sha256(data: Uint8Array): string {
  // SHA-256 constants
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  // Initial hash values
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  // Pre-processing
  const msgLen = data.length;
  const msgBits = BigInt(msgLen) * 8n;

  // Append padding
  const padded = new Uint8Array(((msgLen + 1 + 8 + 63) >> 6) << 6);
  padded.set(data);
  padded[msgLen] = 0x80;

  // Append message length as 128-bit big-endian
  const view = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
  view.setBigInt64(padded.length - 8, msgBits, false);

  // Process message in 512-bit chunks
  for (let chunkStart = 0; chunkStart < padded.length; chunkStart += 64) {
    const w = new Array<number>(64);

    // Copy chunk into first 16 words
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(chunkStart + i * 4, false);
    }

    // Extend the sixteen 32-bit words into eighty 32-bit words
    for (let i = 16; i < 64; i++) {
      const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    // Initialize working variables
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    // Compression function main loop
    for (let i = 0; i < 64; i++) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ ((~e) & g);
      const temp1 = (h + S1 + ch + k[i] + w[i]) >>> 0;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  // Produce the final hash value
  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map(x => ('00000000' + x.toString(16)).slice(-8))
    .join('');
}

/**
 * Right rotate a 32-bit unsigned integer.
 * @internal
 */
function rightRotate(n: number, b: number): number {
  return ((n >>> b) | (n << (32 - b))) >>> 0;
}
