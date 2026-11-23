/**
 * Tests for voter weight classification and suppression.
 */

import { describe, it, expect } from 'vitest';
import { WeightClassOf, RepresentativeWeights, SuppressSmallClasses } from '../weights.js';

describe('weights.ts', () => {
  describe('WeightClassOf', () => {
    it('should classify weight=1 as "1"', () => {
      expect(WeightClassOf(1)).toBe('1');
    });

    it('should classify 1 < weight <= 2 as "1-2"', () => {
      expect(WeightClassOf(1.5)).toBe('1-2');
      expect(WeightClassOf(2)).toBe('1-2');
    });

    it('should classify 2 < weight <= 5 as "2-5"', () => {
      expect(WeightClassOf(3)).toBe('2-5');
      expect(WeightClassOf(5)).toBe('2-5');
    });

    it('should classify 5 < weight <= 10 as "5-10"', () => {
      expect(WeightClassOf(7)).toBe('5-10');
      expect(WeightClassOf(10)).toBe('5-10');
    });

    it('should classify 10 < weight <= 100 as "10-100"', () => {
      expect(WeightClassOf(50)).toBe('10-100');
      expect(WeightClassOf(100)).toBe('10-100');
    });

    it('should classify weight > 100 as "100+"', () => {
      expect(WeightClassOf(101)).toBe('100+');
      expect(WeightClassOf(1000)).toBe('100+');
    });
  });

  describe('RepresentativeWeights', () => {
    it('should return empty object for empty array', () => {
      expect(RepresentativeWeights([])).toEqual({});
    });

    it('should compute mean weight for each class', () => {
      const weights = [1, 1.5, 2, 3]; // Classes: 1, 1-2, 1-2, 2-5
      const result = RepresentativeWeights(weights);
      expect(result['1']).toBe(1);
      expect(result['1-2']).toBe((1.5 + 2) / 2); // Mean of 1.5 and 2
      expect(result['2-5']).toBe(3);
    });

    it('should handle multiple weights in same class', () => {
      const weights = [6, 7, 10]; // All in 5-10
      const result = RepresentativeWeights(weights);
      expect(result['5-10']).toBe((6 + 7 + 10) / 3);
    });

    it('should handle single weight in class', () => {
      const weights = [1];
      const result = RepresentativeWeights(weights);
      expect(result['1']).toBe(1);
    });

    it('should handle mixed classes', () => {
      const weights = [1, 1, 3, 3, 3, 50];
      const result = RepresentativeWeights(weights);
      expect(result['1']).toBe(1);
      expect(result['2-5']).toBe(3);
      expect(result['10-100']).toBe(50);
    });
  });

  describe('SuppressSmallClasses', () => {
    it('should suppress classes below threshold', () => {
      const rows = [
        { WeightClass: '1', Count: 2 },
        { WeightClass: '2-5', Count: 10 },
        { WeightClass: '5-10', Count: 3 },
      ];
      const result = SuppressSmallClasses(rows, 5);
      expect(result.Reported).toHaveLength(1);
      expect(result.Reported[0].WeightClass).toBe('2-5');
      expect(result.SuppressedClasses).toContain('1');
      expect(result.SuppressedClasses).toContain('5-10');
    });

    it('should include classes at threshold', () => {
      const rows = [
        { WeightClass: '1', Count: 5 },
        { WeightClass: '2-5', Count: 4 },
      ];
      const result = SuppressSmallClasses(rows, 5);
      expect(result.Reported).toHaveLength(1);
      expect(result.Reported[0].WeightClass).toBe('1');
      expect(result.SuppressedClasses).toContain('2-5');
    });

    it('should return empty reported and all suppressed for k > counts', () => {
      const rows = [
        { WeightClass: '1', Count: 2 },
        { WeightClass: '2-5', Count: 3 },
      ];
      const result = SuppressSmallClasses(rows, 10);
      expect(result.Reported).toHaveLength(0);
      expect(result.SuppressedClasses).toContain('1');
      expect(result.SuppressedClasses).toContain('2-5');
    });

    it('should return all reported for k=0', () => {
      const rows = [
        { WeightClass: '1', Count: 1 },
        { WeightClass: '2-5', Count: 2 },
      ];
      const result = SuppressSmallClasses(rows, 0);
      expect(result.Reported).toHaveLength(2);
      expect(result.SuppressedClasses).toHaveLength(0);
    });

    it('should sort suppressed classes', () => {
      const rows = [
        { WeightClass: 'Z', Count: 1 },
        { WeightClass: 'A', Count: 2 },
        { WeightClass: 'M', Count: 3 },
      ];
      const result = SuppressSmallClasses(rows, 10);
      expect(result.SuppressedClasses).toEqual(['A', 'M', 'Z']);
    });

    it('should preserve reported row order', () => {
      const rows = [
        { WeightClass: '5-10', Count: 10 },
        { WeightClass: '2-5', Count: 20 },
        { WeightClass: '1', Count: 30 },
      ];
      const result = SuppressSmallClasses(rows, 5);
      expect(result.Reported).toHaveLength(3);
      expect(result.Reported[0].WeightClass).toBe('5-10');
      expect(result.Reported[1].WeightClass).toBe('2-5');
      expect(result.Reported[2].WeightClass).toBe('1');
    });

    it('should handle empty input', () => {
      const result = SuppressSmallClasses([], 5);
      expect(result.Reported).toHaveLength(0);
      expect(result.SuppressedClasses).toHaveLength(0);
    });
  });
});
