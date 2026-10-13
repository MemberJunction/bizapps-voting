/**
 * Election configuration types and resolution logic.
 * Handles type defaults, per-election overrides, and validation.
 */

import type { SecrecyMode, AssuranceTier, ResultsTiming, ResultsAudience, ContestKind } from './types.js';

/**
 * An election type's configuration defaults.
 * These are the base settings that elections of this type inherit.
 */
export interface IElectionTypeConfiguration {
  /** Default secrecy mode: 'Open', 'Confidential', or 'Secret'. */
  SecrecyMode?: SecrecyMode;

  /** Default assurance tier: 'Standard', 'HighAssurance', or 'Verifiable'. */
  AssuranceTier?: AssuranceTier;

  /** When results are made visible: AfterClose, AfterVoting, Live, AdministratorsOnly. */
  ResultsTiming?: ResultsTiming;

  /** Who may see results: Voters, Eligible, HostMembers, Public, Administrators. */
  ResultsAudience?: ResultsAudience;

  /** Minimum cast ballots before results are visible (k-anonymity threshold). */
  ResultsMinCast?: number;

  /** Whether voters may change their ballot before close. */
  AllowRevote?: boolean;

  /** Contest kinds allowed in this election type. */
  AllowedContestKinds?: ContestKind[];

  /** Credential methods allowed for voters. */
  AllowedCredentialMethodCodes?: string[];

  /** Default tally method (e.g., 'plurality', 'majority', 'irv'). */
  DefaultTallyMethodCode?: string;

  /** Reference to the governing document (charter, bylaws, etc.). */
  GoverningDocumentCitation?: string;

  /** Notice period required before the election (in days). */
  NoticePeriodDays?: number;

  /** Whether paper ballots are available (by request or policy). */
  PaperOptionAvailable?: boolean;

  /** Minimum weight-class size for reporting results (k for suppression). */
  WeightClassMinSize?: number;

  /** Configuration keys that elections of this type may override. */
  OverridableKeys?: string[];

  /** Additional type-specific configuration (stored as JSON in the database). */
  [key: string]: unknown;
}

/**
 * An election's configuration: type defaults plus per-election overrides.
 * Only keys listed in the type's OverridableKeys may be set here.
 */
export interface IElectionConfiguration {
  /** Quorum requirement: a count or a percentage of eligible voters. */
  Quorum?: {
    Kind: 'Count' | 'Percent';
    Value: number;
  };

  /** Reminders to non-voters: days before close to send each reminder. */
  Reminders?: {
    DaysBeforeClose: number[];
  };

  /** Languages available for the ballot and UI. */
  Languages?: string[];

  /** Whether an independent administrator (not a type driver) oversees this election. */
  IndependentAdministrator?: boolean;

  /** Any other overridable keys from the type's configuration. */
  [key: string]: unknown;
}

/**
 * The keys an election's `Configuration` may carry: the election-level keys above plus the type defaults an election can
 * override. `Election.Configuration` is readable by every signed-in member once the roll is frozen (row-level security
 * hides rows, not columns), so it is limited to these documented governance parameters, none of which is secret; an
 * election type may declare more, in its `OverridableKeys` or its server driver's `ConfigurationKeys`, under the same rule.
 * Anything else (notes, credentials, roll data) is refused when the election is saved.
 */
export const ELECTION_CONFIGURATION_KEYS: ReadonlyArray<string> = [
  'Quorum',
  'Reminders',
  'Languages',
  'IndependentAdministrator',
  'RequiredCertifiers',
  'SecrecyMode',
  'AssuranceTier',
  'ResultsTiming',
  'ResultsAudience',
  'ResultsMinCast',
  'AllowRevote',
  'AllowedContestKinds',
  'AllowedCredentialMethodCodes',
  'DefaultTallyMethodCode',
  'GoverningDocumentCitation',
  'NoticePeriodDays',
  'PaperOptionAvailable',
  'WeightClassMinSize',
];

/**
 * The keys of an election configuration that are neither documented (`ELECTION_CONFIGURATION_KEYS`) nor declared by the
 * election type (`declaredKeys`: its OverridableKeys and its driver's ConfigurationKeys). Empty when it may be stored.
 */
export function UndeclaredConfigurationKeys(config: IElectionConfiguration | undefined | null, declaredKeys: ReadonlyArray<string> = []): string[] {
  if (!config) return [];
  return Object.keys(config).filter((key) => !ELECTION_CONFIGURATION_KEYS.includes(key) && !declaredKeys.includes(key));
}

/**
 * The fully resolved configuration for an election:
 * app defaults → type config → election-specific overrides.
 */
export interface ResolvedElectionConfiguration extends IElectionTypeConfiguration, IElectionConfiguration {
  /** Keys from the election config that were ignored (not in type's OverridableKeys). */
  IgnoredOverrides?: string[];
}

/**
 * Application-level defaults for all voting elections.
 */
export const VOTING_APP_DEFAULTS: IElectionTypeConfiguration = {
  SecrecyMode: 'Secret',
  AssuranceTier: 'Standard',
  ResultsTiming: 'AfterClose',
  ResultsAudience: 'Voters',
  ResultsMinCast: 5,
  WeightClassMinSize: 5,
  AllowRevote: false,
  AllowedContestKinds: ['Motion', 'Office', 'Question', 'Amendment', 'StandardsItem'],
  AllowedCredentialMethodCodes: ['emailed-link', 'mj-session'],
  DefaultTallyMethodCode: 'plurality',
  NoticePeriodDays: 0,
  PaperOptionAvailable: false,
  GoverningDocumentCitation: undefined,
  OverridableKeys: [],
};

/**
 * Resolves the effective configuration for an election by layering:
 * 1. App defaults (VOTING_APP_DEFAULTS)
 * 2. Election type configuration
 * 3. Per-election overrides (only keys in type's OverridableKeys are accepted)
 *
 * @param appDefaults - Application-level defaults
 * @param typeConfig - The election type's configuration
 * @param electionConfig - The election-specific overrides
 * @returns Resolved configuration with IgnoredOverrides list
 */
export function ResolveElectionConfiguration(
  appDefaults: IElectionTypeConfiguration,
  typeConfig: IElectionTypeConfiguration | undefined,
  electionConfig: IElectionConfiguration | undefined
): ResolvedElectionConfiguration {
  // Start with app defaults
  const resolved: ResolvedElectionConfiguration = {
    ...appDefaults,
  };

  // Layer in type configuration (overrides app defaults)
  if (typeConfig) {
    for (const key of Object.keys(typeConfig)) {
      const value = typeConfig[key as keyof IElectionTypeConfiguration];
      if (value !== undefined) {
        (resolved as Record<string, unknown>)[key] = value;
      }
    }
  }

  // Determine which keys the election is allowed to override
  const overridableKeys = new Set(resolved.OverridableKeys || []);

  // Layer in election-specific overrides
  const ignoredOverrides: string[] = [];
  if (electionConfig) {
    for (const key of Object.keys(electionConfig)) {
      const value = electionConfig[key as keyof IElectionConfiguration];
      if (value !== undefined && key !== 'IgnoredOverrides') {
        // Apply the value
        (resolved as Record<string, unknown>)[key] = value;
        // Track if it's not overridable (for reporting, not enforcement)
        if (!overridableKeys.has(key)) {
          ignoredOverrides.push(key);
        }
      }
    }
  }

  if (ignoredOverrides.length > 0) {
    resolved.IgnoredOverrides = ignoredOverrides;
  }

  return resolved;
}

/**
 * Validates a resolved election configuration against the constraints
 * that the database CHECK constraints enforce.
 *
 * @param config - The resolved configuration
 * @returns Array of validation error messages (empty if valid)
 */
export function ValidateResolvedConfiguration(config: ResolvedElectionConfiguration): string[] {
  const errors: string[] = [];

  // Secret mode implies AllowRevote must be false
  if (config.SecrecyMode === 'Secret' && config.AllowRevote === true) {
    errors.push('SecrecyMode "Secret" requires AllowRevote to be false.');
  }

  // HighAssurance or Verifiable tier implies ResultsTiming must be AfterClose
  if ((config.AssuranceTier === 'HighAssurance' || config.AssuranceTier === 'Verifiable') &&
      config.ResultsTiming !== 'AfterClose') {
    errors.push(`AssuranceTier "${config.AssuranceTier}" requires ResultsTiming to be "AfterClose".`);
  }

  // ResultsMinCast must be >= 0
  if (config.ResultsMinCast !== undefined && config.ResultsMinCast < 0) {
    errors.push(`ResultsMinCast must be >= 0; got ${config.ResultsMinCast}.`);
  }

  // WeightClassMinSize must be >= 1
  if (config.WeightClassMinSize !== undefined && config.WeightClassMinSize < 1) {
    errors.push(`WeightClassMinSize must be >= 1; got ${config.WeightClassMinSize}.`);
  }

  return errors;
}
