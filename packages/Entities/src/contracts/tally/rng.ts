/**
 * Deterministic seeded random number generator.
 *
 * Uses FNV-1a hash to derive a 32-bit state from a string seed, then
 * mulberry32 for pseudo-random sequence generation. Same seed → same sequence.
 */

/**
 * Simple FNV-1a hash for a string (UTF-16 code units).
 */
function fnv1aHash(seed: string): number {
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = (hash * 16777619) >>> 0; // Keep as 32-bit unsigned
  }
  return hash >>> 0;
}

/**
 * Mulberry32: simple 32-bit PRNG.
 */
function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic random number generator seeded from a string.
 */
export class SeededRandom {
  private gen: () => number;

  /**
   * Create a SeededRandom from a string seed.
   * Same seed → same sequence every time.
   */
  public constructor(seed: string) {
    const hash = fnv1aHash(seed);
    this.gen = mulberry32(hash);
  }

  /**
   * Return the next random number in [0, 1).
   */
  public Next(): number {
    return this.gen();
  }

  /**
   * Randomly pick one item from a read-only array.
   */
  public Pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Cannot pick from empty array');
    const index = Math.floor(this.Next() * items.length);
    return items[index];
  }

  /**
   * Fisher-Yates shuffle of a copy of the items.
   * Returns a new array; original is unchanged.
   */
  public Shuffle<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.Next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}
