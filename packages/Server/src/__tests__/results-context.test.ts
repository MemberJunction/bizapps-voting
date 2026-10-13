import { describe, expect, it } from 'vitest';
import type { VotingContext } from '../shared/types.js';
import type { ElectionGraph } from '../shared/election-graph.js';
import { BuildResultsContext } from '../engines/person-support.js';

/** A provider that records which entities were read (RunViewOf binds RunView to it). */
function recordingCtx(): { ctx: VotingContext; reads: string[] } {
    const reads: string[] = [];
    const provider = {
        RunView: async (params: { EntityName: string }) => {
            reads.push(params.EntityName);
            return { Success: true, Results: params.EntityName.endsWith('Contest Results') ? [{ ID: 'R', ContestID: 'C1', Outcome: 'Failed' }] : [] };
        },
        RunViews: async () => [],
        EntityByID: () => undefined,
    };
    return { ctx: { ContextUser: {} as VotingContext['ContextUser'], Provider: provider as unknown as VotingContext['Provider'] }, reads };
}

const graph = {
    Election: { ID: 'E1' },
    ElectionType: {},
    Configuration: {},
    Contests: [{ ID: 'C1', Name: 'Motion' }, { ID: 'C2', Name: 'Seat' }],
} as unknown as ElectionGraph;

describe('BuildResultsContext', () => {
    it('uses the finals the tally hands it and does not re-read Contest Results inside the tally transaction', async () => {
        const { ctx, reads } = recordingCtx();
        const out = await BuildResultsContext(graph, ctx, [{ ContestID: 'c1', Outcome: 'Passed' }, { ContestID: 'C2', Outcome: 'NoQuorum' }]);
        expect(reads.some((r) => r.endsWith('Contest Results'))).toBe(false);
        expect(out.Results).toEqual([
            { ContestID: 'C1', ContestName: 'Motion', Outcome: 'Passed' },
            { ContestID: 'C2', ContestName: 'Seat', Outcome: 'Void' },
        ]);
    });

    it('reads the stored finals when none are given (certification)', async () => {
        const { ctx, reads } = recordingCtx();
        const out = await BuildResultsContext(graph, ctx);
        expect(reads.some((r) => r.endsWith('Contest Results'))).toBe(true);
        expect(out.Results).toEqual([{ ContestID: 'C1', ContestName: 'Motion', Outcome: 'Failed' }]);
    });
});
