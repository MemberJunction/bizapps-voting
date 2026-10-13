import { RegisterClass } from '@memberjunction/global';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { VotingTallyOperation } from '@mj-biz-apps/voting-entities';
import { BaseVotingAction } from './base-voting-action.js';

/**
 * Action: Tally Election
 * Tallies a closed election by executing the `Voting.Tally` Remote Operation.
 *
 * Input: ElectionID, TieBreakSeed (optional). Output: Status, ContestsJSON.
 */
@RegisterClass(BaseVotingAction, 'TallyElectionAction')
@RegisterClass(BaseVotingAction, 'MJ_BizApps_Voting: Tally Election')
export class TallyElectionAction extends BaseVotingAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const electionID = this.getStringParam(params, 'ElectionID');
            if (!electionID) return this.missingParameter('ElectionID');
            const tieBreakSeed = this.getStringParam(params, 'TieBreakSeed');

            const result = await new VotingTallyOperation().Execute({ ElectionID: electionID, TieBreakSeed: tieBreakSeed }, this.buildOperationOptions(params));
            const out = result.Output;
            if (result.Success && out?.Success) {
                this.addOutputParam(params, 'Status', out.Status ?? null);
                this.addOutputParam(params, 'ContestsJSON', JSON.stringify(out.Contests ?? []));
            }
            return this.mapOperationResult(result, `Election tallied: ${electionID}`);
        } catch (error) {
            return this.unexpectedError('TallyElectionAction', error);
        }
    }
}
