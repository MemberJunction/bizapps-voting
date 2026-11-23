import type { UserInfo } from '@memberjunction/core';
import { BaseSingleton, MJGlobal, type ClassRegistration } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';
import type { mjBizAppsVotingElectionEntity, mjBizAppsVotingElectionTypeEntity } from '@mj-biz-apps/voting-entities';

// ============================================================================
// UI Context & Descriptors
// ============================================================================

/**
 * Context passed to UI driver methods, containing information about the current election,
 * election type, and the viewing user.
 */
export interface ElectionUIContext {
  /** The election ID, or null if creating a new election */
  ElectionID: string | null;
  /** The election type ID */
  ElectionTypeID: string;
  /** The election type code (e.g. 'motion', 'board-election') */
  ElectionTypeCode: string;
  /** Current election status (e.g. 'Draft', 'Open', 'Closed') */
  Status: string;
  /** Election secrecy mode ('Open', 'Confidential', 'Secret') */
  SecrecyMode: string;
  /** Whether the viewing user is an election administrator */
  IsAdministrator: boolean;
  /** The viewing user's info, if available */
  ViewingUser?: UserInfo | null;
}

/**
 * Describes an admin tab that may be added to the election's admin interface.
 * The driver may replace an existing tab (same key) or add new ones.
 */
export interface ElectionAdminTabDescriptor {
  /** Unique identifier for this tab */
  key: string;
  /** Display label */
  label: string;
  /** Optional FontAwesome icon class */
  icon?: string;
  /** Display sequence; lower numbers appear first */
  sequence?: number;
  /** Optional election type codes that support this tab; '*' means all types */
  electionTypes?: string[];
  /** ClassFactory key to the Angular component (extends BaseElectionAdminTab) */
  componentClass?: string;
}

/**
 * Describes a setup wizard step for creating or configuring an election.
 * The driver may replace an existing step (same key) or add new ones.
 */
export interface ElectionSetupStepDescriptor {
  /** Unique identifier for this step */
  key: string;
  /** Display label */
  label: string;
  /** Step number in the wizard (1-based) */
  stepNumber: number;
  /** Optional election type codes that include this step; '*' means all types */
  electionTypes?: string[];
  /** ClassFactory key to the Angular component (extends BaseElectionSetupStep) */
  componentClass?: string;
}

/**
 * Describes a form for viewing/editing election-type-specific details
 * (usually a subtype entity's columns).
 */
export interface ElectionDetailsFormDescriptor {
  /** The subtype entity name, if this election type has a subtype */
  entityName: string;
  /** Field names to hide from the auto-generated form (optional fields only) */
  hiddenFieldNames?: string[];
  /** ClassFactory key to a custom component, or undefined to use the form host */
  componentClass?: string;
}

/**
 * Describes a view for displaying election results (e.g. winner list, tally breakdown).
 * The driver may replace an existing results view (same key) or add new ones.
 */
export interface ElectionResultsViewDescriptor {
  /** Unique identifier for this view */
  key: string;
  /** Display label */
  label: string;
  /** Display sequence; lower numbers appear first */
  sequence?: number;
  /** Optional election type codes that support this view; '*' means all types */
  electionTypes?: string[];
  /** ClassFactory key to the Angular component (extends BaseElectionResultsView) */
  componentClass?: string;
}

/**
 * Vocabulary customization per election type. Maps concept names to display labels
 * so that a "standard" election type can call them "Members", "Candidates", "Votes", etc.
 */
export interface ElectionVocabulary {
  /** Label for the container (e.g. 'Election', 'Motion', 'Referendum') */
  Election?: string;
  /** Label for a contest/race/item (e.g. 'Contest', 'Race', 'Question') */
  Contest?: string;
  /** Label for a candidate/choice (e.g. 'Candidate', 'Option', 'Choice') */
  Option?: string;
  /** Label for a voter (e.g. 'Voter', 'Member', 'Participant') */
  Voter?: string;
  /** Label for a vote/ballot (e.g. 'Vote', 'Ballot', 'Selection') */
  Vote?: string;
  /** Label for the list of eligible voters (e.g. 'Roll', 'Roster', 'Register') */
  EligibleVoters?: string;
  /** Additional custom labels keyed by concept */
  [key: string]: string | undefined;
}

// ============================================================================
// BaseElectionTypeUIDriver
// ============================================================================

/**
 * Base UI driver for election types. Downstream apps can subclass this and register it
 * using the UIDriverClass name specified in ElectionType metadata.
 *
 * Each method receives the default set and may replace items (by key) or add new ones.
 * Contributions from other apps may only add; only the type's own driver may replace
 * a built-in item (see overlayDescriptors).
 */
export class BaseElectionTypeUIDriver {
  /**
   * Return the admin tabs for this election type. The driver may replace or add tabs.
   */
  public GetAdminTabs(
    ctx: ElectionUIContext,
    defaults: ElectionAdminTabDescriptor[]
  ): ElectionAdminTabDescriptor[] {
    return defaults;
  }

  /**
   * Return the setup wizard steps for this election type. The driver may replace or add steps.
   */
  public GetSetupSteps(
    ctx: ElectionUIContext,
    defaults: ElectionSetupStepDescriptor[]
  ): ElectionSetupStepDescriptor[] {
    return defaults;
  }

  /**
   * Return the details form descriptor for this election type (usually for subtype-specific fields).
   * Return undefined to show no form, or a descriptor with componentClass for a custom form.
   */
  public GetDetailsForm(
    ctx: ElectionUIContext,
    defaults: ElectionDetailsFormDescriptor | null
  ): ElectionDetailsFormDescriptor | null {
    return defaults;
  }

  /**
   * Return the results view descriptors for this election type. The driver may replace or add views.
   */
  public GetResultsViews(
    ctx: ElectionUIContext,
    defaults: ElectionResultsViewDescriptor[]
  ): ElectionResultsViewDescriptor[] {
    return defaults;
  }

  /**
   * Return vocabulary customizations for this election type, merged with defaults.
   */
  public GetVocabulary(
    ctx: ElectionUIContext,
    defaults: ElectionVocabulary
  ): ElectionVocabulary {
    return defaults;
  }
}

// ============================================================================
// Descriptor Overlay & Merging
// ============================================================================

function normalizeKey(key: string): string {
  return key.toLowerCase().trim();
}

/**
 * Merge two descriptor arrays where the 'own' set may replace items from 'defaults'
 * if they share the same key. Sorted by sequence.
 */
export function overlayDescriptors<TDescriptor extends { key: string; sequence?: number }>(
  defaults: readonly TDescriptor[],
  own: readonly TDescriptor[]
): TDescriptor[] {
  const merged = new Map<string, TDescriptor>();
  for (const item of defaults) {
    merged.set(normalizeKey(item.key), item);
  }
  for (const item of own) {
    merged.set(normalizeKey(item.key), item);
  }
  const result = Array.from(merged.values());
  result.sort((a, b) => (a.sequence ?? 100) - (b.sequence ?? 100));
  return result;
}

// ============================================================================
// Contribution Metadata & Assembler
// ============================================================================

/** What has been logged already; contributions are assembled per election type loaded, and a clash logs once. */
const loggedContributionFaults = new Set<string>();
function logContributionOnce(message: string): void {
  if (loggedContributionFaults.has(message)) return;
  loggedContributionFaults.add(message);
  LogError(message);
}

/**
 * Metadata that a contributing app attaches to a component registered with @RegisterClassEx.
 * Used by assembleElectionContributions to filter and merge contributions by election type.
 */
export interface ElectionContributionMetadata {
  /** Election type codes this contribution applies to ('*' means all types) */
  electionTypes: string[];
  /** Unique contribution key (e.g. 'my-app:voting-summary') */
  contributionKey: string;
  /** Display label */
  label?: string;
  /** FontAwesome icon class */
  icon?: string;
  /** Display sequence */
  sequence?: number;
}

/**
 * Assemble election contributions from app-registered classes, filtered by election type,
 * and merge with built-in parts. Contributions may only add; the type's own driver may replace.
 *
 * @param baseClass The base class all contributions extend (e.g. BaseElectionAdminTab)
 * @param electionTypeCode The code of the election type being loaded
 * @param defaults The built-in parts (from the driver)
 * @param descriptorFactory Function to convert a ClassRegistration and metadata to a descriptor
 * @returns The merged and sorted list
 */
export function assembleElectionContributions<TDescriptor extends { key: string; sequence?: number }>(
  baseClass: object,
  electionTypeCode: string,
  defaults: TDescriptor[],
  descriptorFactory: (reg: ClassRegistration, metadata: ElectionContributionMetadata) => TDescriptor
): TDescriptor[] {
  const factory = MJGlobal.Instance.ClassFactory;
  const normalizedCode = electionTypeCode.toLowerCase().trim();

  // Gather all registrations that have electionTypes metadata matching this type
  const registrations = factory.GetAllRegistrationsByMetadata(baseClass, (meta) => {
    if (!meta) return false;
    const m = meta as Record<string, string | number | boolean | string[] | undefined>;
    const contributionKey = typeof m['contributionKey'] === 'string' ? m['contributionKey'] : '';
    const electionTypes = Array.isArray(m['electionTypes']) ? (m['electionTypes'] as string[]) : [];
    if (!contributionKey || electionTypes.length === 0) return false;
    return electionTypes.some((t) => t === '*' || t.toLowerCase().trim() === normalizedCode);
  });

  // Deduplicate on key (case-insensitive): higher Priority wins, earliest on tie
  const map = new Map<string, { reg: ClassRegistration; meta: ElectionContributionMetadata }>();
  for (const reg of registrations) {
    const raw = reg.Metadata as Record<string, string | number | boolean | string[] | undefined>;
    const meta: ElectionContributionMetadata = {
      contributionKey: String(raw['contributionKey']),
      electionTypes: Array.isArray(raw['electionTypes']) ? (raw['electionTypes'] as string[]) : [],
      label: typeof raw['label'] === 'string' ? raw['label'] : undefined,
      icon: typeof raw['icon'] === 'string' ? raw['icon'] : undefined,
      sequence: typeof raw['sequence'] === 'number' ? raw['sequence'] : undefined,
    };
    const key = normalizeKey(meta.contributionKey);
    const existing = map.get(key);
    if (!existing || reg.Priority > existing.reg.Priority) {
      if (existing) {
        logContributionOnce(
          `[assembleElectionContributions] Two contributions to '${electionTypeCode}' ` +
          `elections share the key '${meta.contributionKey}'; ` +
          `the one with higher priority (${reg.Priority}) is used and the other (${existing.reg.Priority}) is ignored.`
        );
      }
      map.set(key, { reg, meta });
    } else {
      logContributionOnce(
        `[assembleElectionContributions] Two contributions to '${electionTypeCode}' ` +
        `elections share the key '${meta.contributionKey}'; ` +
        `${reg.Priority === existing.reg.Priority ? `at the same priority (${reg.Priority}) the first registered is used` : `the one with higher priority (${existing.reg.Priority}) is used`}.`
      );
    }
  }

  const contributedItems: TDescriptor[] = [];
  for (const { reg, meta } of map.values()) {
    const desc = descriptorFactory(reg, meta);
    contributedItems.push(desc);
  }

  // Contributions only add to the built-in set. A contribution whose key clashes with a built-in
  // part is refused: any app could otherwise remove core UI from every election type.
  // Only the type's own driver may replace a built-in part (via overlayDescriptors).
  const mergedMap = new Map<string, TDescriptor>();
  for (const def of defaults) {
    mergedMap.set(normalizeKey(def.key), def);
  }
  for (const contrib of contributedItems) {
    const key = normalizeKey(contrib.key);
    if (mergedMap.has(key)) {
      logContributionOnce(
        `[assembleElectionContributions] A contribution keyed '${contrib.key}' ` +
        `clashes with an existing part in '${electionTypeCode}' elections and was refused. ` +
        `Contributions add parts; they do not replace them.`
      );
      continue;
    }
    mergedMap.set(key, contrib);
  }

  const result = Array.from(mergedMap.values());
  result.sort((a, b) => (a.sequence ?? 100) - (b.sequence ?? 100));
  return result;
}

// ============================================================================
// ElectionTypeUIDriverRegistry
// ============================================================================

/**
 * Singleton registry that resolves election type UI drivers by class name.
 * Uses the ClassFactory to instantiate drivers on demand and caches them.
 * Falls back to the base driver if a class is not registered.
 */
export class ElectionTypeUIDriverRegistry extends BaseSingleton<ElectionTypeUIDriverRegistry> {
  private _instances = new Map<string, BaseElectionTypeUIDriver>();
  private _loggedMissing = new Set<string>();

  protected constructor() {
    super();
  }

  public static get Instance(): ElectionTypeUIDriverRegistry {
    return super.getInstance<ElectionTypeUIDriverRegistry>();
  }

  /**
   * Resolve a driver by class name. Returns the base driver if not registered.
   */
  public ResolveDriver(driverClassName?: string | null): BaseElectionTypeUIDriver {
    if (!driverClassName || driverClassName.trim() === '') {
      return this.GetDefaultDriver();
    }

    const normalized = driverClassName.trim();
    const cached = this._instances.get(normalized);
    if (cached) {
      return cached;
    }

    const res = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseElectionTypeUIDriver>(
      BaseElectionTypeUIDriver,
      normalized
    );
    if (res.Resolved && res.Instance) {
      this._instances.set(normalized, res.Instance);
      return res.Instance;
    }

    if (!this._loggedMissing.has(normalized)) {
      this._loggedMissing.add(normalized);
      LogError(
        `[ElectionTypeUIDriverRegistry] UI driver '${normalized}' not registered. ` +
        `Falling back to BaseElectionTypeUIDriver.`
      );
    }

    return this.GetDefaultDriver();
  }

  /**
   * Get the base driver instance (used as fallback).
   */
  public GetDefaultDriver(): BaseElectionTypeUIDriver {
    const key = '__default__';
    let def = this._instances.get(key);
    if (!def) {
      def = new BaseElectionTypeUIDriver();
      this._instances.set(key, def);
    }
    return def;
  }

  /**
   * Clear the cache (called when election types are reloaded).
   */
  public ClearCache(): void {
    this._instances.clear();
    this._loggedMissing.clear();
  }
}
