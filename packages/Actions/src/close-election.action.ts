import { RegisterClass } from '@memberjunction/global';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { VotingCloseElectionOperation } from '@mj-biz-apps/voting-entities';
import { BaseVotingAction } from './base-voting-action.js';

/**
 * Action: Close Election
 * Transitions an Open election to Closed by executing the `Voting.CloseElection`
 * Remote Operation as the context user.
 *
 * Input: ElectionID. Output: Status.
 */
@RegisterClass(BaseVotingAction, 'CloseElectionAction')
@RegisterClass(BaseVotingAction, 'MJ_BizApps_Voting: Close Election')
export class CloseElectionAction extends BaseVotingAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const electionID = this.getStringParam(params, 'ElectionID');
            if (!electionID) return this.missingParameter('ElectionID');

            const result = await new VotingCloseElectionOperation().Execute({ ElectionID: electionID }, this.buildOperationOptions(params));
            if (result.Output?.Status) this.addOutputParam(params, 'Status', result.Output.Status);
            return this.mapOperationResult(result, `Election closed: ${electionID}`);
        } catch (error) {
            return this.unexpectedError('CloseElectionAction', error);
        }
    }
}
