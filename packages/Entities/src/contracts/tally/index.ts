/**
 * Tally methods and related functions for voting contests.
 *
 * Pure TypeScript, no imports outside contracts folder.
 * Deterministic and reproducible from ballot set, method, and tie-break seed.
 */

export { SeededRandom } from './rng.js';
export { RequiredShare, MeetsThreshold } from './threshold.js';
export {
  RoundVotes,
  CountFirstChoices,
  CountAllSelections,
  ComputeVotesCastAndAbstentions,
  RankWithTies,
  BuildOptionResults,
} from './common.js';
export { PluralityTallyMethod } from './plurality.js';
export { MajorityTallyMethod } from './majority.js';
export { ApprovalTallyMethod } from './approval.js';
export { IrvTallyMethod } from './irv.js';
export { StvTallyMethod } from './stv.js';
export { TALLY_METHODS, GetTallyMethod } from './registry.js';
