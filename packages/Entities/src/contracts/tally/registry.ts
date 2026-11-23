import { BaseTallyMethodContract } from '../types.js';
import { PluralityTallyMethod } from './plurality.js';
import { MajorityTallyMethod } from './majority.js';
import { ApprovalTallyMethod } from './approval.js';
import { IrvTallyMethod } from './irv.js';
import { StvTallyMethod } from './stv.js';

/**
 * Registry of available tally methods, keyed by Code.
 */
export const TALLY_METHODS: Record<string, BaseTallyMethodContract> = {
  plurality: new PluralityTallyMethod(),
  majority: new MajorityTallyMethod(),
  approval: new ApprovalTallyMethod(),
  irv: new IrvTallyMethod(),
  stv: new StvTallyMethod(),
};

/**
 * Get a tally method by Code. Returns null if not found.
 */
export function GetTallyMethod(code: string): BaseTallyMethodContract | null {
  return TALLY_METHODS[code] ?? null;
}
