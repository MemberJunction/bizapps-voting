/**
 * Tests for election state machine.
 */

import { describe, it, expect } from 'vitest';
import { ALLOWED_TRANSITIONS, CanTransition, IsConfigurationLocked, IsTerminal } from '../state.js';
import type { ElectionStatus } from '../types.js';

describe('state.ts', () => {
  describe('ALLOWED_TRANSITIONS', () => {
    it('should define transitions for all statuses', () => {
      const statuses: ElectionStatus[] = ['Draft', 'Nominations', 'Ready', 'Open', 'Closed', 'Tallied', 'Certified', 'Cancelled'];
      for (const status of statuses) {
        expect(ALLOWED_TRANSITIONS[status]).toBeDefined();
        expect(Array.isArray(ALLOWED_TRANSITIONS[status])).toBe(true);
      }
    });

    it('should allow Draft → Nominations, Ready, Cancelled', () => {
      expect(ALLOWED_TRANSITIONS.Draft).toContain('Nominations');
      expect(ALLOWED_TRANSITIONS.Draft).toContain('Ready');
      expect(ALLOWED_TRANSITIONS.Draft).toContain('Cancelled');
    });

    it('should allow Nominations → Ready, Cancelled', () => {
      expect(ALLOWED_TRANSITIONS.Nominations).toContain('Ready');
      expect(ALLOWED_TRANSITIONS.Nominations).toContain('Cancelled');
    });

    it('should allow Ready → Open, Draft, Cancelled', () => {
      expect(ALLOWED_TRANSITIONS.Ready).toContain('Open');
      expect(ALLOWED_TRANSITIONS.Ready).toContain('Draft');
      expect(ALLOWED_TRANSITIONS.Ready).toContain('Cancelled');
    });

    it('should allow Open → Closed, Cancelled', () => {
      expect(ALLOWED_TRANSITIONS.Open).toContain('Closed');
      expect(ALLOWED_TRANSITIONS.Open).toContain('Cancelled');
    });

    it('should allow Closed → Tallied, Cancelled', () => {
      expect(ALLOWED_TRANSITIONS.Closed).toContain('Tallied');
      expect(ALLOWED_TRANSITIONS.Closed).toContain('Cancelled');
    });

    it('should allow Tallied → Certified, Tallied, Cancelled', () => {
      expect(ALLOWED_TRANSITIONS.Tallied).toContain('Certified');
      expect(ALLOWED_TRANSITIONS.Tallied).toContain('Tallied');
      expect(ALLOWED_TRANSITIONS.Tallied).toContain('Cancelled');
    });

    it('should have no transitions from Certified', () => {
      expect(ALLOWED_TRANSITIONS.Certified).toHaveLength(0);
    });

    it('should have no transitions from Cancelled', () => {
      expect(ALLOWED_TRANSITIONS.Cancelled).toHaveLength(0);
    });
  });

  describe('CanTransition', () => {
    it('should allow valid transitions', () => {
      expect(CanTransition('Draft', 'Nominations')).toBe(true);
      expect(CanTransition('Open', 'Closed')).toBe(true);
      expect(CanTransition('Closed', 'Tallied')).toBe(true);
    });

    it('should reject invalid transitions', () => {
      expect(CanTransition('Draft', 'Open')).toBe(false); // Can't skip Ready
      expect(CanTransition('Open', 'Tallied')).toBe(false); // Must go through Closed
      expect(CanTransition('Certified', 'Cancelled')).toBe(false); // Terminal state
    });

    it('should allow re-tallying', () => {
      expect(CanTransition('Tallied', 'Tallied')).toBe(true);
    });
  });

  describe('IsConfigurationLocked', () => {
    it('should have unlocked configuration for Draft, Nominations, Ready', () => {
      expect(IsConfigurationLocked('Draft')).toBe(false);
      expect(IsConfigurationLocked('Nominations')).toBe(false);
      expect(IsConfigurationLocked('Ready')).toBe(false);
    });

    it('should have locked configuration for Open onward', () => {
      expect(IsConfigurationLocked('Open')).toBe(true);
      expect(IsConfigurationLocked('Closed')).toBe(true);
      expect(IsConfigurationLocked('Tallied')).toBe(true);
      expect(IsConfigurationLocked('Certified')).toBe(true);
      expect(IsConfigurationLocked('Cancelled')).toBe(true);
    });
  });

  describe('IsTerminal', () => {
    it('should mark Certified and Cancelled as terminal', () => {
      expect(IsTerminal('Certified')).toBe(true);
      expect(IsTerminal('Cancelled')).toBe(true);
    });

    it('should not mark other statuses as terminal', () => {
      expect(IsTerminal('Draft')).toBe(false);
      expect(IsTerminal('Nominations')).toBe(false);
      expect(IsTerminal('Ready')).toBe(false);
      expect(IsTerminal('Open')).toBe(false);
      expect(IsTerminal('Closed')).toBe(false);
      expect(IsTerminal('Tallied')).toBe(false);
    });
  });
});
