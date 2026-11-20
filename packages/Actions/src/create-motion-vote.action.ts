import { RegisterClass } from '@memberjunction/global';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { VotingAnchor, VotingCreateElectionInput, VotingCreateElectionOperation, VotingThresholdKind } from '@mj-biz-apps/voting-entities';
import { BaseVotingAction } from './base-voting-action.js';

const THRESHOLD_KINDS: ReadonlyArray<VotingThresholdKind> = ['None', 'Majority', 'ThreeFifths', 'TwoThirds', 'ThreeQuarters', 'Unanimous', 'Custom'];

/** Parameters of the Create Motion Vote action, already parsed. */
export interface MotionVoteSpec {
    Name: string;
    MotionText: string;
    AnchorEntityName?: string;
    AnchorRecordID?: string;
    EligibilitySourceCode: string;
    EligibilitySourceSettings?: Record<string, unknown>;
    ClosesAt: string;
    Threshold: VotingThresholdKind;
    ElectionTypeCode: string;
}

/** Builds the `Voting.CreateElection` input for a single-motion yes/no election. */
export function BuildMotionElectionInput(spec: MotionVoteSpec): VotingCreateElectionInput {
    const anchors: VotingAnchor[] = spec.AnchorEntityName && spec.AnchorRecordID
        ? [{ EntityName: spec.AnchorEntityName, RecordID: spec.AnchorRecordID, IsPrimary: true }]
        : [];
    return {
        ElectionTypeCode: spec.ElectionTypeCode,
        Name: spec.Name,
        Anchors: anchors,
        EligibilitySource: { Code: spec.EligibilitySourceCode, Settings: spec.EligibilitySourceSettings },
        ClosesAt: spec.ClosesAt,
        Contests: [{
            Name: spec.Name,
            Description: spec.MotionText,
            Kind: 'Motion',
            Seats: 1,
            TallyMethodCode: 'majority',
            Threshold: spec.Threshold,
            AllowAbstain: true
        }]
    };
}

/**
 * Action: Create Motion Vote
 * Creates a yes/no motion election (one Motion contest) by executing the
 * `Voting.CreateElection` Remote Operation as the context user.
 *
 * Input: Name, MotionText, AnchorEntityName, AnchorRecordID, EligibilitySourceCode,
 *        EligibilitySourceSettings (JSON), ClosesAt (ISO 8601), Threshold (default Majority),
 *        ElectionTypeCode (default 'motion').
 * Output: ElectionID.
 */
@RegisterClass(BaseVotingAction, 'CreateMotionVoteAction')
@RegisterClass(BaseVotingAction, 'MJ_BizApps_Voting: Create Motion Vote')
export class CreateMotionVoteAction extends BaseVotingAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const name = this.getStringParam(params, 'Name');
            const motionText = this.getStringParam(params, 'MotionText');
            const eligibilitySourceCode = this.getStringParam(params, 'EligibilitySourceCode');
            const settingsStr = this.getStringParam(params, 'EligibilitySourceSettings');
            const closesAtStr = this.getStringParam(params, 'ClosesAt');
            const thresholdStr = this.getStringParam(params, 'Threshold', 'Majority') as string;
            const anchorEntityName = this.getStringParam(params, 'AnchorEntityName');
            const anchorRecordID = this.getStringParam(params, 'AnchorRecordID');

            if (!name) return this.missingParameter('Name');
            if (!motionText) return this.missingParameter('MotionText');
            if (!eligibilitySourceCode) return this.missingParameter('EligibilitySourceCode');
            if (!closesAtStr) return this.missingParameter('ClosesAt');
            if (!!anchorEntityName !== !!anchorRecordID) {
                return { Success: false, ResultCode: 'INVALID_PARAMETER', Message: "'AnchorEntityName' and 'AnchorRecordID' must be supplied together" };
            }

            const threshold = THRESHOLD_KINDS.find((k) => k.toLowerCase() === thresholdStr.toLowerCase());
            if (!threshold) {
                return { Success: false, ResultCode: 'INVALID_PARAMETER', Message: `Invalid Threshold '${thresholdStr}'. Expected one of: ${THRESHOLD_KINDS.join(', ')}` };
            }

            let settings: Record<string, unknown> | undefined;
            if (settingsStr) {
                try {
                    const parsed: unknown = JSON.parse(settingsStr);
                    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('must be a JSON object');
                    settings = parsed as Record<string, unknown>;
                } catch (e) {
                    return { Success: false, ResultCode: 'INVALID_SETTINGS_JSON', Message: `Invalid EligibilitySourceSettings JSON: ${e instanceof Error ? e.message : String(e)}` };
                }
            }

            const closesAt = new Date(closesAtStr);
            if (isNaN(closesAt.getTime())) {
                return { Success: false, ResultCode: 'INVALID_DATE', Message: `Invalid ClosesAt date: ${closesAtStr}` };
            }

            const input = BuildMotionElectionInput({
                Name: name,
                MotionText: motionText,
                AnchorEntityName: anchorEntityName,
                AnchorRecordID: anchorRecordID,
                EligibilitySourceCode: eligibilitySourceCode,
                EligibilitySourceSettings: settings,
                ClosesAt: closesAt.toISOString(),
                Threshold: threshold,
                ElectionTypeCode: this.getStringParam(params, 'ElectionTypeCode', 'motion') as string
            });

            const result = await new VotingCreateElectionOperation().Execute(input, this.buildOperationOptions(params));
            if (result.Success && result.Output?.Success && result.Output.ElectionID) {
                this.addOutputParam(params, 'ElectionID', result.Output.ElectionID);
            }
            return this.mapOperationResult(result, 'Motion election created');
        } catch (error) {
            return this.unexpectedError('CreateMotionVoteAction', error);
        }
    }
}
