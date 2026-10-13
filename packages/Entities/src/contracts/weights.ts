/**
 * Voter weight classification and suppression for results reporting.
 * Implements k-anonymity by weight class to prevent re-identification.
 */

/**
 * Classifies a voter weight into a weight class.
 * Weight classes are: '1' (single), '1-2', '2-5', '5-10', '10-100', '100+'.
 *
 * @param weight - The voter's weight (typically 1 for one-person-one-vote)
 * @returns The weight class as a string
 */
export function WeightClassOf(weight: number): string {
  if (weight === 1) {
    return '1';
  }
  if (weight <= 2) {
    return '1-2';
  }
  if (weight <= 5) {
    return '2-5';
  }
  if (weight <= 10) {
    return '5-10';
  }
  if (weight <= 100) {
    return '10-100';
  }
  return '100+';
}

/**
 * Computes the representative (mean) weight for each weight class.
 * Used by the tally engine to convert weighted ballots to a representative weight.
 *
 * @param weights - Array of actual voter weights in a class
 * @returns Object mapping weight class to its mean weight (representative weight)
 */
export function RepresentativeWeights(weights: number[]): Record<string, number> {
  if (weights.length === 0) {
    return {};
  }

  const byClass = new Map<string, number[]>();
  for (const weight of weights) {
    const wc = WeightClassOf(weight);
    if (!byClass.has(wc)) {
      byClass.set(wc, []);
    }
    byClass.get(wc)!.push(weight);
  }

  const result: Record<string, number> = {};
  for (const [wc, classWeights] of byClass) {
    const sum = classWeights.reduce((a, b) => a + b, 0);
    result[wc] = sum / classWeights.length;
  }

  return result;
}

/**
 * Suppresses small weight classes from a results set for privacy.
 * Returns the reported results and a list of which classes were suppressed.
 *
 * @param rows - Array of result rows with WeightClass and Count properties
 * @param k - Minimum number of voters in a class to report (e.g., 5)
 * @returns Object with Reported rows and SuppressedClasses list
 */
export function SuppressSmallClasses<T extends { WeightClass: string; Count: number }>(
  rows: T[],
  k: number
): { Reported: T[]; SuppressedClasses: string[] } {
  const reported: T[] = [];
  const suppressed = new Set<string>();

  for (const row of rows) {
    if (row.Count >= k) {
      reported.push(row);
    } else {
      suppressed.add(row.WeightClass);
    }
  }

  return {
    Reported: reported,
    SuppressedClasses: Array.from(suppressed).sort(),
  };
}
