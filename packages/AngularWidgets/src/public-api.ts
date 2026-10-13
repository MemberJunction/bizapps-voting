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
