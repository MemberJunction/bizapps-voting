/**
 * BaseVerifiableTallyProvider: the seam for assurance tier C (Verifiable, design section 4.4 and phase P4).
 *
 * An ElectionGuard-style integration lives outside this package: it registers a subclass with
 * `@RegisterClass(BaseVerifiableTallyProvider, VERIFIABLE_TALLY_PROVIDER_KEY)`. The tally engine asks the ClassFactory for
 * that registration and REFUSES to tally a Verifiable election when none exists (a tier-C election must never silently
 * fall back to a weaker tally).
 *
 * The provider owns decryption of the homomorphic tally and the public verification artifacts. It hands the engine one
 * `TallyContestInput` per contest (decrypted counts expressed as ballots, or aggregate-equivalent ballots) so the same
 * `contracts` tally methods and the same result-writing path run for every tier.
 */

import { MJGlobal } from '@memberjunction/global';
import { type TallyContestInput } from '@mj-biz-apps/voting-entities';
import { type ElectionGraph } from '../shared/election-graph.js';
import { type VotingContext } from '../shared/types.js';

/** ClassFactory key under BaseVerifiableTallyProvider. */
export const VERIFIABLE_TALLY_PROVIDER_KEY = 'ElectionGuard';

export interface VerifiableTallyRequest {
    Graph: ElectionGraph;
    /** Contest inputs prepared by the engine WITHOUT ballots (OptionIDs, Seats, thresholds, EligibleWeight, seed); the provider fills `Ballots`. */
    ContestInputs: TallyContestInput[];
}

export interface VerifiableTallyResult {
    /** The same contest inputs with `Ballots` filled from the verified decryption. */
    ContestInputs: TallyContestInput[];
    /** Public verification artifacts (for example an election record bundle), stored or published by the provider itself. Opaque to the engine. */
    ArtifactsReference?: string;
    /** Number of ballots the provider counted. */
    BallotCount: number;
}

export abstract class BaseVerifiableTallyProvider {
    /** Decrypts and verifies the tally. Throw or return a failure message; never log ballot content. */
    public abstract ProduceTally(request: VerifiableTallyRequest, ctx: VotingContext): Promise<VerifiableTallyResult>;
}

/** The registered provider instance, or null when none is registered. */
export function ResolveVerifiableTallyProvider(): BaseVerifiableTallyProvider | null {
    const attempt = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseVerifiableTallyProvider>(
        BaseVerifiableTallyProvider,
        VERIFIABLE_TALLY_PROVIDER_KEY
    );
    return attempt && attempt.Resolved && attempt.Instance ? attempt.Instance : null;
}
