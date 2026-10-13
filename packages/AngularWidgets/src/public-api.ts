/**
 * @mj-biz-apps/voting-ng-widgets — BizApps Voting's L2 widget package (no router,
 * no Explorer imports; see MJ's guides/UI_LAYERING_GUIDE.md).
 *
 * What lands here (plans/bizapps-voting-design.md §6, §9):
 *   - BaseElectionTypeUIDriver and the contribution base classes (tabs, setup
 *     steps, results views) that election types and other apps register against.
 *   - The <mj-ballot> custom element, built from its own MJ-core-free entry
 *     point and bundle, guarded in CI so no MemberJunction core code leaks in.
 */

// Election type UI driver base and registry
export { BaseElectionTypeUIDriver, ElectionTypeUIDriverRegistry } from './lib/base-election-type-ui-driver';
export type {
  ElectionUIContext,
  ElectionAdminTabDescriptor,
  ElectionSetupStepDescriptor,
  ElectionDetailsFormDescriptor,
  ElectionResultsViewDescriptor,
  ElectionVocabulary,
  ElectionContributionMetadata,
} from './lib/base-election-type-ui-driver';
export { overlayDescriptors, assembleElectionContributions } from './lib/base-election-type-ui-driver';

// Contribution base classes
export { BaseElectionAdminTab } from './lib/base-election-admin-tab';
export { BaseElectionSetupStep } from './lib/base-election-setup-step';
export { BaseElectionResultsView } from './lib/base-election-results-view';

// Standards Ballot election type (UI driver, document step, comments results view)
export {
  StandardsBallotUIDriver,
  STANDARDS_BALLOT_TYPE_CODE,
  STANDARDS_BALLOT_EXTENSION_ENTITY,
  STANDARDS_BALLOT_DETAILS_COMPONENT,
  STANDARDS_BALLOT_COMMENTS_COMPONENT,
} from './lib/standards-ballot-ui-driver';
export { StandardsBallotDetailsStepComponent } from './lib/standards-ballot-details-step';
export { StandardsBallotCommentsViewComponent } from './lib/standards-ballot-comments-view';
export { StandardsDetailsIssues } from './lib/standards-ballot-details-rules';
export type { StandardsDetailsValues, PriorBallotOption } from './lib/standards-ballot-details-rules';
export { BuildCommentRows, SummarizeComments } from './lib/standards-ballot-comment-rows';
export type { CommentRow, CommentSummary, CommentRowSource, ResolutionRowSource, ContestRowSource } from './lib/standards-ballot-comment-rows';
