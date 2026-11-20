import { RegisterClass } from '@memberjunction/global';
import {
  BaseElectionTypeUIDriver,
  type ElectionDetailsFormDescriptor,
  type ElectionResultsViewDescriptor,
  type ElectionSetupStepDescriptor,
  type ElectionUIContext,
  type ElectionVocabulary,
} from './base-election-type-ui-driver';

/** The election type's code (metadata/election-types). */
export const STANDARDS_BALLOT_TYPE_CODE = 'standards-ballot';
/** The IS-A child entity holding the document and recirculation columns. */
export const STANDARDS_BALLOT_EXTENSION_ENTITY = 'MJ_BizApps_Voting: Standards Ballot Elections';
/** ClassFactory keys of the components this driver points at (registered by standards-ballot-details-step / standards-ballot-comments-view). */
export const STANDARDS_BALLOT_DETAILS_COMPONENT = 'StandardsBallotDetailsStep';
export const STANDARDS_BALLOT_COMMENTS_COMPONENT = 'StandardsBallotCommentsView';

const DETAILS_STEP_KEY = 'standards-ballot-details';
const COMMENTS_VIEW_KEY = 'standards-ballot-comments';

/**
 * UI driver of the Standards Ballot election type: the vocabulary of a standards body (items, positions, ballots), an extra
 * setup step and details form for the document and recirculation columns, and a results view of the comments and how each
 * was resolved. Descriptors only; the components live beside this file.
 */
@RegisterClass(BaseElectionTypeUIDriver, 'StandardsBallotUIDriver')
export class StandardsBallotUIDriver extends BaseElectionTypeUIDriver {
  public override GetVocabulary(ctx: ElectionUIContext, defaults: ElectionVocabulary): ElectionVocabulary {
    return { ...defaults, Contest: 'Item', Option: 'Position', Vote: 'Ballot' };
  }

  /** One step after the defaults: the document being balloted and, for a recirculation, the ballot it follows. */
  public override GetSetupSteps(ctx: ElectionUIContext, defaults: ElectionSetupStepDescriptor[]): ElectionSetupStepDescriptor[] {
    const rest = defaults.filter((s) => s.key !== DETAILS_STEP_KEY);
    const stepNumber = rest.reduce((max, s) => Math.max(max, s.stepNumber), 0) + 1;
    return [
      ...rest,
      {
        key: DETAILS_STEP_KEY,
        label: 'Document',
        stepNumber,
        electionTypes: [STANDARDS_BALLOT_TYPE_CODE],
        componentClass: STANDARDS_BALLOT_DETAILS_COMPONENT,
      },
    ];
  }

  public override GetDetailsForm(ctx: ElectionUIContext, defaults: ElectionDetailsFormDescriptor | null): ElectionDetailsFormDescriptor | null {
    return { ...(defaults ?? {}), entityName: STANDARDS_BALLOT_EXTENSION_ENTITY, componentClass: STANDARDS_BALLOT_DETAILS_COMPONENT };
  }

  /** The comments and their resolutions are a roll-call matter: the view exists only for an Open (roll call) ballot. */
  public override GetResultsViews(ctx: ElectionUIContext, defaults: ElectionResultsViewDescriptor[]): ElectionResultsViewDescriptor[] {
    if (ctx.SecrecyMode !== 'Open') return defaults;
    return [
      ...defaults.filter((v) => v.key !== COMMENTS_VIEW_KEY),
      {
        key: COMMENTS_VIEW_KEY,
        label: 'Comments',
        sequence: 50,
        electionTypes: [STANDARDS_BALLOT_TYPE_CODE],
        componentClass: STANDARDS_BALLOT_COMMENTS_COMPONENT,
      },
    ];
  }
}
