import { RegisterClass } from '@memberjunction/global';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { VotingGetTurnoutOperation } from '@mj-biz-apps/voting-entities';
import { BaseVotingAction } from './base-voting-action.js';

/**
 * Action: Get Turnout
 * Retrieves turnout statistics by executing the `Voting.GetTurnout` Remote Operation.
 *
 * Input: ElectionID.
 * Output: VoterCount (eligible), TurnoutCount (voted), TurnoutPercent, QuorumMet, TurnoutJSON.
 */
@RegisterClass(BaseVotingAction, 'GetTurnoutAction')
@RegisterClass(BaseVotingAction, 'MJ_BizApps_Voting: Get Turnout')
export class GetTurnoutAction extends BaseVotingAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const electionID = this.getStringParam(params, 'ElectionID');
            if (!electionID) return this.missingParameter('ElectionID');

            const result = await new VotingGetTurnoutOperation().Execute({ ElectionID: electionID }, this.buildOperationOptions(params));
            const out = result.Output;
            if (result.Success && out?.Success) {
                this.addOutputParam(params, 'VoterCount', out.Eligible ?? 0);
                this.addOutputParam(params, 'TurnoutCount', out.Voted ?? 0);
                this.addOutputParam(params, 'TurnoutPercent', out.TurnoutPercent ?? 0);
                this.addOutputParam(params, 'QuorumMet', out.QuorumMet ?? null);
                this.addOutputParam(params, 'TurnoutJSON', JSON.stringify(out));
            }
            return this.mapOperationResult(result, `Turnout retrieved: ${electionID}`);
        } catch (error) {
            return this.unexpectedError('GetTurnoutAction', error);
        }
    }
}
