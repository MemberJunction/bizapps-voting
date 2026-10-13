/**
 * Tests for receipt code formatting and validation.
 */

import { describe, it, expect } from 'vitest';
import { FormatReceiptCode, IsReceiptCode, NormalizeReceiptCode } from '../receipt.js';

describe('receipt.ts', () => {
  describe('FormatReceiptCode', () => {
    it('should format 13 bytes as 20-char code', () => {
      const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      const code = FormatReceiptCode(bytes);
      expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    });

    it('should reject less than 13 bytes', () => {
      const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]); // 12 bytes
      expect(() => FormatReceiptCode(bytes)).toThrow();
    });

    it('should accept more than 13 bytes (uses first 13)', () => {
      const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
      const code = FormatReceiptCode(bytes);
      expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    });

    it('should be deterministic', () => {
      const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
      const code1 = FormatReceiptCode(bytes);
      const code2 = FormatReceiptCode(bytes);
      expect(code1).toBe(code2);
    });

    it('should produce different codes for different bytes', () => {
      const bytes1 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
      const bytes2 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14]);
      const code1 = FormatReceiptCode(bytes1);
      const code2 = FormatReceiptCode(bytes2);
      expect(code1).not.toBe(code2);
    });
  });

  describe('IsReceiptCode', () => {
    it('should accept valid receipt code format', () => {
      expect(IsReceiptCode('0123-4567-89AB-CDEF-GHJK')).toBe(true);
    });

    it('should reject code without dashes', () => {
      expect(IsReceiptCode('0123456789ABCDEFGHJK')).toBe(false);
    });

    it('should reject code with wrong dash positions', () => {
      expect(IsReceiptCode('0123--4567-89AB-CDEF-GHJK')).toBe(false);
    });

    it('should reject code that is too short', () => {
      expect(IsReceiptCode('0123-4567-89AB-CDEF')).toBe(false);
    });

    it('should reject code with lowercase letters', () => {
      expect(IsReceiptCode('0123-4567-89ab-cdef-ghjk')).toBe(false);
    });

    it('should reject code with invalid characters (I not in alphabet)', () => {
      expect(IsReceiptCode('0123-4567-89AB-CDEF-GHIJ')).toBe(false); // I not in alphabet
    });

    it('should reject code with invalid characters (O not in alphabet)', () => {
      expect(IsReceiptCode('0123-4567-89AB-CDEF-GHJO')).toBe(false); // O not in alphabet
    });

    it('should reject non-string input', () => {
      expect(IsReceiptCode(123 as any)).toBe(false);
      expect(IsReceiptCode(null as any)).toBe(false);
      expect(IsReceiptCode(undefined as any)).toBe(false);
    });

    it('should validate well-formed codes', () => {
      const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
      const code = FormatReceiptCode(bytes);
      expect(IsReceiptCode(code)).toBe(true);
    });
  });

  describe('NormalizeReceiptCode', () => {
    it('should handle valid code already', () => {
      const code = '0123-4567-89AB-CDEF-GHJK';
      expect(NormalizeReceiptCode(code)).toBe(code);
    });

    it('should convert lowercase to uppercase', () => {
      const code = '0123-4567-89ab-cdef-ghjk';
      expect(NormalizeReceiptCode(code)).toBe('0123-4567-89AB-CDEF-GHJK');
    });

    it('should remove whitespace', () => {
      const code = '0123 4567 89AB CDEF GHJK';
      expect(NormalizeReceiptCode(code)).toBe('0123-4567-89AB-CDEF-GHJK');
    });

    it('should map O to 0', () => {
      const code = '0123-4567-89AB-CDEF-GHJO';
      const result = NormalizeReceiptCode(code);
      expect(result).toBe('0123-4567-89AB-CDEF-GHJ0');
    });

    it('should map I to 1', () => {
      const code = '0123-4567-89AB-CDEF-GHJI';
      const result = NormalizeReceiptCode(code);
      expect(result).toBe('0123-4567-89AB-CDEF-GHJ1');
    });

    it('should map L to 1', () => {
      const code = '0123-4567-89AB-CDEF-GHJL';
      const result = NormalizeReceiptCode(code);
      expect(result).toBe('0123-4567-89AB-CDEF-GHJ1');
    });

    it('should map U to V', () => {
      const code = '0123-4567-89AB-CDEF-GHJU';
      const result = NormalizeReceiptCode(code);
      expect(result).toBe('0123-4567-89AB-CDEF-GHJV');
    });

    it('should handle mixed case and whitespace', () => {
      const code = '0123 4567 89ab cdef ghjk';
      expect(NormalizeReceiptCode(code)).toBe('0123-4567-89AB-CDEF-GHJK');
    });

    it('should map multiple confusable characters', () => {
      const code = 'O1L3-4567-89AB-CDEF-GHJU';
      const result = NormalizeReceiptCode(code);
      expect(result).toBe('0113-4567-89AB-CDEF-GHJV');
    });

    it('should return original if normalization fails (wrong length)', () => {
      const code = 'invalid-code-here-too-short';
      expect(NormalizeReceiptCode(code)).toBe(code);
    });

    it('should return original if invalid character remains after mapping', () => {
      const code = '0123-4567-89AB-CDEF-GHJX'; // X is not in alphabet
      expect(NormalizeReceiptCode(code)).toBe(code);
    });

    it('should handle real receipt codes', () => {
      const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
      const original = FormatReceiptCode(bytes);
      const normalized = NormalizeReceiptCode(original);
      expect(normalized).toBe(original);
    });
  });
});
