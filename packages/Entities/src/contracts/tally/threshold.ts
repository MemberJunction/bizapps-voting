import type { ThresholdKind } from '../types.js';

/**
 * Compute the required share (fraction in [0, 1]) for a threshold kind.
 *
 * - None: 0 (only need yes > no)
 * - Majority: 0.5 (strictly greater than half)
 * - ThreeFifths: 0.6
 * - TwoThirds: 2/3
 * - ThreeQuarters: 0.75
 * - Unanimous: 1 (all yes, no no's)
 * - Custom: the provided custom fraction
 */
export function RequiredShare(kind: ThresholdKind, custom?: number): number {
  switch (kind) {
    case 'None':
      return 0;
    case 'Majority':
      return 0.5;
    case 'ThreeFifths':
      return 0.6;
    case 'TwoThirds':
      return 2 / 3;
    case 'ThreeQuarters':
      return 0.75;
    case 'Unanimous':
      return 1;
    case 'Custom':
      if (custom === undefined) throw new Error('Custom threshold requires a value');
      return custom;
    default:
      const _exhaustive: never = kind;
      return _exhaustive;
  }
}

/**
 * Check whether a threshold has been met.
 *
 * @param yes Weighted yes votes (numerator).
 * @param no Weighted no votes.
 * @param basisTotal Total eligible weight (denominator), used when needed.
 * @param kind The threshold kind.
 * @param custom Custom threshold fraction (required if kind is 'Custom').
 * @returns true if the threshold is met.
 *
 * Rules:
 * - Majority: yes > basisTotal / 2 (strictly greater, not >=)
 * - Other fractions: yes >= share * basisTotal (with 1e-9 tolerance)
 * - Unanimous: no === 0 && yes > 0
 * - None: yes > no
 *
 * Tolerance of 1e-9 handles floating-point rounding.
 */
export function MeetsThreshold(
  yes: number,
  no: number,
  basisTotal: number,
  kind: ThresholdKind,
  custom?: number
): boolean {
  const tolerance = 1e-9;

  if (kind === 'None') {
    return yes > no;
  }

  if (kind === 'Unanimous') {
    // Every vote in the basis must be a yes: with ThresholdBasis 'VotesCast' that means no opposing
    // votes; with 'Eligible' it also means every eligible voter voted yes.
    return no <= tolerance && yes > 0 && yes >= basisTotal - tolerance;
  }

  const share = RequiredShare(kind, custom);

  if (kind === 'Majority') {
    // Strictly greater than half
    return yes > basisTotal / 2;
  }

  // Other thresholds (ThreeFifths, TwoThirds, ThreeQuarters, Custom):
  // yes >= share * basisTotal
  return yes >= share * basisTotal - tolerance;
}
