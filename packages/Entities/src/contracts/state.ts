/**
 * Election state machine: valid transitions, locked states, and terminal states.
 */

import type { ElectionStatus } from './types.js';

/**
 * Defines the valid state transitions in the election lifecycle.
 * Each status maps to the list of statuses it can transition to.
 *
 * State flow:
 * - Draft → Nominations, Ready, Cancelled
 * - Nominations → Ready, Cancelled
 * - Ready → Open, Draft, Cancelled
 * - Open → Closed, Cancelled
 * - Closed → Tallied, Cancelled
 * - Tallied → Certified, Tallied (re-tally), Cancelled
 * - Certified → (terminal)
 * - Cancelled → (terminal)
 */
export const ALLOWED_TRANSITIONS: Record<ElectionStatus, ElectionStatus[]> = {
  Draft: ['Nominations', 'Ready', 'Cancelled'],
  Nominations: ['Ready', 'Cancelled'],
  Ready: ['Open', 'Draft', 'Cancelled'],
  Open: ['Closed', 'Cancelled'],
  Closed: ['Tallied', 'Cancelled'],
  Tallied: ['Certified', 'Tallied', 'Cancelled'],
  Certified: [],
  Cancelled: [],
};

/**
 * Checks if a transition from one status to another is allowed.
 *
 * @param from - The current election status
 * @param to - The target election status
 * @returns true if the transition is valid, false otherwise
 */
export function CanTransition(from: ElectionStatus, to: ElectionStatus): boolean {
  const allowed = ALLOWED_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Determines if an election's configuration is locked from changes.
 * Configuration is locked from the Open status onward, including all later statuses.
 *
 * Locked status set: Open, Closed, Tallied, Certified, Cancelled
 * Unlocked (configuration editable): Draft, Nominations, Ready
 *
 * @param status - The election status
 * @returns true if configuration is locked for this status, false if editable
 */
export function IsConfigurationLocked(status: ElectionStatus): boolean {
  const lockedStatuses: ElectionStatus[] = ['Open', 'Closed', 'Tallied', 'Certified', 'Cancelled'];
  return lockedStatuses.includes(status);
}

/**
 * Checks if an election status is terminal (no further transitions allowed).
 * Terminal statuses: Certified, Cancelled
 *
 * @param status - The election status
 * @returns true if no further transitions are allowed, false otherwise
 */
export function IsTerminal(status: ElectionStatus): boolean {
  return status === 'Certified' || status === 'Cancelled';
}

/**
 * Statuses after which no ballot can be cast. A ballot distribution created then could only publish a ballot that
 * refuses everyone, so new distributions are refused (existing ones stay editable: pausing or retiring is still useful).
 */
export const DISTRIBUTION_CLOSED_STATUSES: ReadonlyArray<ElectionStatus> = ['Closed', 'Tallied', 'Certified', 'Cancelled'];

/**
 * Why a ballot distribution cannot be created for (or moved to) an election in `status`, or null when it can.
 * Shared by the server-side entity rule and the admin UI, so both say the same thing.
 */
export function DescribeDistributionCreateRefusal(status: ElectionStatus): string | null {
  if (!DISTRIBUTION_CLOSED_STATUSES.includes(status)) return null;
  return `Cannot create a ballot distribution: the election is ${status} and no longer accepts ballots.`;
}
