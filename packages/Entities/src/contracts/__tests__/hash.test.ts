/**
 * Tests for hash utilities: SHA-256 and JSON canonicalization.
 */

import { describe, it, expect } from 'vitest';
import { Sha256Hex, CanonicalJSON, ComputeBallotStyleHash } from '../hash.js';

describe('hash.ts', () => {
  describe('Sha256Hex', () => {
    it('should compute SHA-256 for empty string', () => {
      // NIST test vector: empty string
      const hash = Sha256Hex('');
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('should compute SHA-256 for "abc"', () => {
      // NIST test vector: "abc"
      const hash = Sha256Hex('abc');
      expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });

    it('should compute SHA-256 for 448-bit message', () => {
      // NIST test vector: "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"
      const msg = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq';
      const hash = Sha256Hex(msg);
      expect(hash).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    });

    it('should compute SHA-256 for 1,000,000 "a" characters', () => {
      // NIST test vector: one million 'a' characters
      const hash = Sha256Hex('a'.repeat(1000000));
      expect(hash).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
    });

    it('should be deterministic', () => {
      const msg = 'test message';
      const hash1 = Sha256Hex(msg);
      const hash2 = Sha256Hex(msg);
      expect(hash1).toBe(hash2);
    });

    it('should handle UTF-8 encoding', () => {
      // The hash should change for different UTF-8 bytes
      const hash1 = Sha256Hex('hello');
      const hash2 = Sha256Hex('hеllo'); // Cyrillic 'е' instead of Latin 'e'
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('CanonicalJSON', () => {
    it('should produce canonical output for objects with sorted keys', () => {
      const obj = { z: 1, a: 2, m: 3 };
      const result = CanonicalJSON(obj);
      expect(result).toBe('{"a":2,"m":3,"z":1}');
    });

    it('should handle nested objects with sorted keys', () => {
      const obj = { outer: { z: 1, a: 2 }, b: 3 };
      const result = CanonicalJSON(obj);
      expect(result).toBe('{"b":3,"outer":{"a":2,"z":1}}');
    });

    it('should omit undefined properties', () => {
      const obj = { a: 1, b: undefined, c: 3 };
      const result = CanonicalJSON(obj);
      expect(result).toBe('{"a":1,"c":3}');
    });

    it('should handle arrays in order', () => {
      const obj = { items: [3, 1, 2] };
      const result = CanonicalJSON(obj);
      expect(result).toBe('{"items":[3,1,2]}');
    });

    it('should have no whitespace', () => {
      const obj = { a: 1, b: { c: 2 } };
      const result = CanonicalJSON(obj);
      expect(result).not.toContain(' ');
      expect(result).not.toContain('\n');
    });

    it('should be deterministic for the same input', () => {
      const obj = { z: 1, a: 2 };
      const result1 = CanonicalJSON(obj);
      const result2 = CanonicalJSON(obj);
      expect(result1).toBe(result2);
    });

    it('should handle null values', () => {
      const obj = { a: null, b: 2 };
      const result = CanonicalJSON(obj);
      expect(result).toBe('{"a":null,"b":2}');
    });

    it('should handle arrays of objects', () => {
      const obj = { items: [{ z: 1, a: 2 }, { b: 3 }] };
      const result = CanonicalJSON(obj);
      expect(result).toBe('{"items":[{"a":2,"z":1},{"b":3}]}');
    });
  });

  describe('ComputeBallotStyleHash', () => {
    it('should compute a deterministic hash for a ballot style', () => {
      const style = {
        ElectionID: 'election-123',
        ElectionName: 'Board Election 2026',
        SecrecyMode: 'Secret' as const,
        AllowRevote: false,
        Language: 'en',
        Contests: [],
      };

      const hash1 = ComputeBallotStyleHash(style);
      const hash2 = ComputeBallotStyleHash(style);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // 64 hex chars = 256 bits
    });

    it('should produce different hashes for different styles', () => {
      const style1 = {
        ElectionID: 'election-123',
        ElectionName: 'Board Election 2026',
        SecrecyMode: 'Secret' as const,
        AllowRevote: false,
        Language: 'en',
        Contests: [],
      };

      const style2 = {
        ElectionID: 'election-124', // Different
        ElectionName: 'Board Election 2026',
        SecrecyMode: 'Secret' as const,
        AllowRevote: false,
        Language: 'en',
        Contests: [],
      };

      const hash1 = ComputeBallotStyleHash(style1);
      const hash2 = ComputeBallotStyleHash(style2);

      expect(hash1).not.toBe(hash2);
    });

    it('should produce different hashes when contests change', () => {
      const style1 = {
        ElectionID: 'election-123',
        ElectionName: 'Board Election 2026',
        SecrecyMode: 'Secret' as const,
        AllowRevote: false,
        Language: 'en',
        Contests: [
          {
            ContestID: 'contest-1',
            Name: 'Director',
            Options: [
              { OptionID: 'opt1', Label: 'Alice' },
              { OptionID: 'opt2', Label: 'Bob' },
            ],
          },
        ] as unknown[],
      };

      const style2 = {
        ElectionID: 'election-123',
        ElectionName: 'Board Election 2026',
        SecrecyMode: 'Secret' as const,
        AllowRevote: false,
        Language: 'en',
        Contests: [
          {
            ContestID: 'contest-1',
            Name: 'Director',
            Options: [
              { OptionID: 'opt1', Label: 'Alice' },
              { OptionID: 'opt2', Label: 'Charlie' }, // Different
            ],
          },
        ] as unknown[],
      };

      const hash1 = ComputeBallotStyleHash(style1);
      const hash2 = ComputeBallotStyleHash(style2);

      expect(hash1).not.toBe(hash2);
    });

    it('should ignore field order (canonical ordering)', () => {
      const style1 = {
        ElectionID: 'election-123',
        ElectionName: 'Board Election 2026',
        SecrecyMode: 'Secret' as const,
        AllowRevote: false,
        Language: 'en',
        Contests: [],
      };

      // Same data, different order
      const style2 = {
        Language: 'en',
        Contests: [],
        AllowRevote: false,
        SecrecyMode: 'Secret' as const,
        ElectionName: 'Board Election 2026',
        ElectionID: 'election-123',
      };

      const hash1 = ComputeBallotStyleHash(style1);
      const hash2 = ComputeBallotStyleHash(style2);

      expect(hash1).toBe(hash2);
    });
  });
});
