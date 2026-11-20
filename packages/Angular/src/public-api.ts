/**
 * @mj-biz-apps/voting-ng — the CLIENT BOOTSTRAP package (MJ Explorer, L3).
 *
 * Named in mj-app.json under packages.client with role "bootstrap": MJExplorer's generated
 * open-app bootstrap imports this module, and `LoadBizAppsVotingClient()` (the startupExport)
 * keeps every registration alive. Importing is what fires the @RegisterClass decorators.
 *
 * Registered here: the generated entity forms, and the dashboards the app's nav items name
 * (DriverClass must match metadata/applications exactly, or the tab renders empty):
 *   VotingElectionsResource      elections list, wizard and election detail tabs
 *   VotingElectionTypesResource  types, tally methods, eligibility sources, sign-in methods
 *   VotingResultsResource        results, certification, receipt verification
 *   VotingSettingsResource       ballot distributions and embed snippets
 *   VotingBallotResource         the signed-in user's ballot (mj-voting-explorer-ballot)
 *   VotingTrusteeShareResource   trustee key-share submission
 */
import '@mj-biz-apps/voting-entities';
import './lib/generated/generated-forms.module';
import { GeneratedFormsModule } from './lib/generated/generated-forms.module';
import { LoadVotingElectionsResource } from './lib/elections';
import { LoadVotingElectionTypesResource } from './lib/election-types';
import { LoadVotingResultsResource } from './lib/results';
import { LoadVotingSettingsResource } from './lib/settings';
import { LoadVotingTrusteeShareResource } from './lib/trustee';
import { LoadVotingBallotResource, LoadVotingExplorerBallot } from './lib/ballot';

export { GeneratedFormsModule } from './lib/generated/generated-forms.module';
export { VotingElectionsResource, ElectionWizardComponent } from './lib/elections';
export { VotingElectionTypesResourceComponent } from './lib/election-types';
export { VotingResultsResourceComponent } from './lib/results';
export { VotingSettingsResourceComponent } from './lib/settings';
export { VotingExplorerBallotComponent, VotingBallotResourceComponent } from './lib/ballot';
export { VotingTrusteeShareResourceComponent } from './lib/trustee';
export { VotingApiService } from './lib/shared';

export function LoadBizAppsVotingClient(): void {
    void GeneratedFormsModule;
    LoadVotingElectionsResource();
    LoadVotingElectionTypesResource();
    LoadVotingResultsResource();
    LoadVotingSettingsResource();
    LoadVotingBallotResource();
    LoadVotingExplorerBallot();
    LoadVotingTrusteeShareResource();
}
