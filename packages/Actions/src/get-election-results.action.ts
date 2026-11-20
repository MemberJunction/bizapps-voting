import { RegisterClass } from '@memberjunction/global';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { VotingGetResultsOperation } from '@mj-biz-apps/voting-entities';
import { BaseVotingAction } from './base-voting-action.js';

/**
 * Action: Get Election Results
 * Retrieves results by executing the `Voting.GetResults` Remote Operation. The operation resolves
 * the viewer (administrator / eligible / voted) from the context user; the caller cannot assert it.
 *
 * Input: ElectionID.
 * Output: ResultsJSON (full output), Visible, IsFinal, Reason.
 */
@RegisterClass(BaseVotingAction, 'GetElectionResultsAction')
@RegisterClass(BaseVotingAction, 'MJ_BizApps_Voting: Get Election Results')
export class GetElectionResultsAction extends BaseVotingAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const electionID = this.getStringParam(params, 'ElectionID');
            if (!electionID) return this.missingParameter('ElectionID');

            const result = await new VotingGetResultsOperation().Execute({ ElectionID: electionID }, this.buildOperationOptions(params));
            const out = result.Output;
            if (result.Success && out?.Success) {
                this.addOutputParam(params, 'ResultsJSON', JSON.stringify(out));
                this.addOutputParam(params, 'Visible', out.Visible ?? false);
                this.addOutputParam(params, 'IsFinal', out.IsFinal ?? false);
                this.addOutputParam(params, 'Reason', out.Reason ?? null);
            }
            return this.mapOperationResult(result, `Results retrieved: ${electionID}`);
        } catch (error) {
            return this.unexpectedError('GetElectionResultsAction', error);
        }
    }
}
