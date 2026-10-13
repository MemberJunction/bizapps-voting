/**
 * Tests for election configuration resolution and validation.
 */

import { describe, it, expect } from 'vitest';
import {
  VOTING_APP_DEFAULTS,
  ResolveElectionConfiguration,
  ValidateResolvedConfiguration,
  type IElectionTypeConfiguration,
  type IElectionConfiguration,
} from '../configuration.js';

describe('configuration.ts', () => {
  describe('VOTING_APP_DEFAULTS', () => {
    it('should have required defaults', () => {
      expect(VOTING_APP_DEFAULTS.SecrecyMode).toBe('Secret');
      expect(VOTING_APP_DEFAULTS.AssuranceTier).toBe('Standard');
      expect(VOTING_APP_DEFAULTS.ResultsTiming).toBe('AfterClose');
      expect(VOTING_APP_DEFAULTS.ResultsAudience).toBe('Voters');
      expect(VOTING_APP_DEFAULTS.ResultsMinCast).toBe(5);
      expect(VOTING_APP_DEFAULTS.WeightClassMinSize).toBe(5);
      expect(VOTING_APP_DEFAULTS.AllowRevote).toBe(false);
      expect(VOTING_APP_DEFAULTS.DefaultTallyMethodCode).toBe('plurality');
      expect(VOTING_APP_DEFAULTS.NoticePeriodDays).toBe(0);
      expect(VOTING_APP_DEFAULTS.PaperOptionAvailable).toBe(false);
    });
  });

  describe('ResolveElectionConfiguration', () => {
    it('should use app defaults when type and election configs are undefined', () => {
      const resolved = ResolveElectionConfiguration(VOTING_APP_DEFAULTS, undefined, undefined);
      expect(resolved.SecrecyMode).toBe('Secret');
      expect(resolved.AllowRevote).toBe(false);
    });

    it('should layer type config over app defaults', () => {
      const typeConfig: IElectionTypeConfiguration = {
        SecrecyMode: 'Open',
        AllowRevote: true,
        OverridableKeys: [],
      };
      const resolved = ResolveElectionConfiguration(VOTING_APP_DEFAULTS, typeConfig, undefined);
      expect(resolved.SecrecyMode).toBe('Open');
      expect(resolved.AllowRevote).toBe(true);
      expect(resolved.AssuranceTier).toBe('Standard'); // From app defaults
    });

    it('should only apply overrides if they are in OverridableKeys', () => {
      const typeConfig: IElectionTypeConfiguration = {
        OverridableKeys: ['ResultsMinCast'],
      };
      const electionConfig: IElectionConfiguration = {
        ResultsMinCast: 10,
        IndependentAdministrator: true,
      };
      const resolved = ResolveElectionConfiguration(VOTING_APP_DEFAULTS, typeConfig, electionConfig);
      expect(resolved.ResultsMinCast).toBe(10); // Overridable
      expect(resolved.IndependentAdministrator).toBe(true); // Still applied (not restricted)
    });

    it('should list ignored overrides', () => {
      const typeConfig: IElectionTypeConfiguration = {
        OverridableKeys: ['ResultsMinCast'],
      };
      const electionConfig: IElectionConfiguration = {
        ResultsMinCast: 10,
        Languages: ['en', 'es'],
      };
      const resolved = ResolveElectionConfiguration(VOTING_APP_DEFAULTS, typeConfig, electionConfig);
      expect(resolved.IgnoredOverrides).toContain('Languages');
    });

    it('should not list IgnoredOverrides in the ignored set', () => {
      const typeConfig: IElectionTypeConfiguration = {
        OverridableKeys: [],
      };
      const electionConfig: IElectionConfiguration = {
        Languages: ['en'],
      };
      const resolved = ResolveElectionConfiguration(VOTING_APP_DEFAULTS, typeConfig, electionConfig);
      expect(resolved.IgnoredOverrides).not.toContain('IgnoredOverrides');
    });

    it('should ignore undefined values in overrides', () => {
      const typeConfig: IElectionTypeConfiguration = {
        OverridableKeys: ['ResultsMinCast'],
      };
      const electionConfig: IElectionConfiguration = {
        ResultsMinCast: undefined,
      };
      const resolved = ResolveElectionConfiguration(VOTING_APP_DEFAULTS, typeConfig, electionConfig);
      expect(resolved.ResultsMinCast).toBe(5); // From app defaults
    });

    it('should handle type config without OverridableKeys', () => {
      const typeConfig: IElectionTypeConfiguration = {
        SecrecyMode: 'Confidential',
        // OverridableKeys not defined
      };
      const electionConfig: IElectionConfiguration = {
        Languages: ['en'],
      };
      const resolved = ResolveElectionConfiguration(VOTING_APP_DEFAULTS, typeConfig, electionConfig);
      expect(resolved.SecrecyMode).toBe('Confidential');
      expect(resolved.IgnoredOverrides).toContain('Languages');
    });
  });

  describe('ValidateResolvedConfiguration', () => {
    it('should accept valid configurations', () => {
      const config = VOTING_APP_DEFAULTS;
      const errors = ValidateResolvedConfiguration(config);
      expect(errors).toHaveLength(0);
    });

    it('should reject Secret mode with AllowRevote=true', () => {
      const config = {
        ...VOTING_APP_DEFAULTS,
        SecrecyMode: 'Secret' as const,
        AllowRevote: true,
      };
      const errors = ValidateResolvedConfiguration(config);
      expect(errors).toContainEqual(expect.stringContaining('Secret'));
      expect(errors).toContainEqual(expect.stringContaining('AllowRevote'));
    });

    it('should allow Secret mode with AllowRevote=false', () => {
      const config = {
        ...VOTING_APP_DEFAULTS,
        SecrecyMode: 'Secret' as const,
        AllowRevote: false,
      };
      const errors = ValidateResolvedConfiguration(config);
      expect(errors).toHaveLength(0);
    });

    it('should allow Confidential and Open with AllowRevote=true', () => {
      const config1 = {
        ...VOTING_APP_DEFAULTS,
        SecrecyMode: 'Confidential' as const,
        AllowRevote: true,
      };
      const errors1 = ValidateResolvedConfiguration(config1);
      expect(errors1).toHaveLength(0);

      const config2 = {
        ...VOTING_APP_DEFAULTS,
        SecrecyMode: 'Open' as const,
        AllowRevote: true,
      };
      const errors2 = ValidateResolvedConfiguration(config2);
      expect(errors2).toHaveLength(0);
    });

    it('should reject HighAssurance with non-AfterClose ResultsTiming', () => {
      const config = {
        ...VOTING_APP_DEFAULTS,
        AssuranceTier: 'HighAssurance' as const,
        ResultsTiming: 'Live' as const,
      };
      const errors = ValidateResolvedConfiguration(config);
      expect(errors).toContainEqual(expect.stringContaining('HighAssurance'));
      expect(errors).toContainEqual(expect.stringContaining('AfterClose'));
    });

    it('should allow HighAssurance with AfterClose ResultsTiming', () => {
      const config = {
        ...VOTING_APP_DEFAULTS,
        AssuranceTier: 'HighAssurance' as const,
        ResultsTiming: 'AfterClose' as const,
      };
      const errors = ValidateResolvedConfiguration(config);
      expect(errors.filter(e => e.includes('HighAssurance'))).toHaveLength(0);
    });

    it('should reject Verifiable with non-AfterClose ResultsTiming', () => {
      const config = {
        ...VOTING_APP_DEFAULTS,
        AssuranceTier: 'Verifiable' as const,
        ResultsTiming: 'AfterVoting' as const,
      };
      const errors = ValidateResolvedConfiguration(config);
      expect(errors).toContainEqual(expect.stringContaining('Verifiable'));
    });

    it('should reject negative ResultsMinCast', () => {
      const config = {
        ...VOTING_APP_DEFAULTS,
        ResultsMinCast: -1,
      };
      const errors = ValidateResolvedConfiguration(config);
      expect(errors).toContainEqual(expect.stringContaining('ResultsMinCast'));
    });

    it('should allow ResultsMinCast=0', () => {
      const config = {
        ...VOTING_APP_DEFAULTS,
        ResultsMinCast: 0,
      };
      const errors = ValidateResolvedConfiguration(config);
      expect(errors.filter(e => e.includes('ResultsMinCast'))).toHaveLength(0);
    });

    it('should reject WeightClassMinSize < 1', () => {
      const config = {
        ...VOTING_APP_DEFAULTS,
        WeightClassMinSize: 0,
      };
      const errors = ValidateResolvedConfiguration(config);
      expect(errors).toContainEqual(expect.stringContaining('WeightClassMinSize'));
    });

    it('should allow WeightClassMinSize >= 1', () => {
      const config = {
        ...VOTING_APP_DEFAULTS,
        WeightClassMinSize: 1,
      };
      const errors = ValidateResolvedConfiguration(config);
      expect(errors.filter(e => e.includes('WeightClassMinSize'))).toHaveLength(0);
    });
  });
});
