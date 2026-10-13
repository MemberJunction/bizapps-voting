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
