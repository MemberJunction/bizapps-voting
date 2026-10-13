import { RegisterClass } from '@memberjunction/global';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { VotingOpenElectionOperation } from '@mj-biz-apps/voting-entities';
import { BaseVotingAction } from './base-voting-action.js';

/**
 * Action: Open Election
 * Transitions an election from Draft/Nominations/Ready to Open by executing the
 * `Voting.OpenElection` Remote Operation as the context user.
 *
 * Input: ElectionID. Output: Status.
 */
@RegisterClass(BaseVotingAction, 'OpenElectionAction')
@RegisterClass(BaseVotingAction, 'MJ_BizApps_Voting: Open Election')
export class OpenElectionAction extends BaseVotingAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const electionID = this.getStringParam(params, 'ElectionID');
            if (!electionID) return this.missingParameter('ElectionID');

            const result = await new VotingOpenElectionOperation().Execute({ ElectionID: electionID }, this.buildOperationOptions(params));
            if (result.Output?.Status) this.addOutputParam(params, 'Status', result.Output.Status);
            return this.mapOperationResult(result, `Election opened: ${electionID}`);
        } catch (error) {
            return this.unexpectedError('OpenElectionAction', error);
        }
    }
}
