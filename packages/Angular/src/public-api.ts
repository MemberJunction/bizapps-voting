/**
 * @mj-biz-apps/voting-ng — the CLIENT BOOTSTRAP package.
 *
 * This is the package named in mj-app.json under packages.client with role
 * "bootstrap". When the app is installed (or dev-linked), MJExplorer's
 * auto-generated open-app-bootstrap.generated.ts gains a static
 * `import '@mj-biz-apps/voting-ng';` — ESBuild bundles it and module evaluation
 * fires the @RegisterClass decorators that make your components discoverable.
 *
 * WHAT LIVES HERE
 *   src/lib/generated/ — CodeGen Angular output (entity forms; do not edit)
 *   src/lib/           — your hand-written components (dashboards, tabs, ...)
 *
 * AFTER YOUR FIRST CODEGEN RUN (the pattern every shipped app uses): import
 * the entity package + the generated forms module so their @RegisterClass
 * decorators fire, and RE-EXPORT the generated module/components so the
 * host's class-registration manifest can import them by name:
 *
 *   import '@mj-biz-apps/voting-entities';
 *   import './lib/generated/generated-forms.module';
 *   export { GeneratedFormsModule } from './lib/generated/generated-forms.module';
 *   export { <YourEntity>FormComponent } from './lib/generated/Entities/<YourEntity>/<yourentity>.form.component';
 *
 * HAND-WRITTEN COMPONENT EXAMPLE — a resource component that renders as a tab
 * in MJ Explorer. Its DriverClass string must match a DefaultNavItems entry in
 * metadata/applications/ EXACTLY; a mismatch renders an empty tab with no error.
 * The full visibility chain (component -> registration -> bundle -> nav item ->
 * user access) is docs/template-docs/explorer-visibility.md:
 *
 *   import { Component } from '@angular/core';
 *   import { RegisterClass } from '@memberjunction/global';
 *   import { BaseResourceComponent, ResourceData } from '@memberjunction/ng-shared';
 *
 *   @RegisterClass(BaseResourceComponent, 'VotingDashboard')
 *   @Component({
 *     selector: 'voting-dashboard',
 *     template: '<div><h2>MJ_BizApps_Voting</h2></div>',
 *     standalone: false
 *   })
 *   export class VotingDashboardComponent extends BaseResourceComponent {
 *     async GetResourceDisplayName(data: ResourceData): Promise<string> { return 'MJ_BizApps_Voting'; }
 *     async GetResourceIconClass(data: ResourceData): Promise<string> { return 'fa-solid fa-cube'; }
 *
 *     // ALWAYS signal completion — Explorer shows a loading state until you do:
 *     ngOnInit(): void { this.NotifyLoadComplete(); }
 *   }
 *
 * ...and export it from this file, or the bundler tree-shakes it away and the
 * decorator never runs.
 *
 * NOTE: package.json already carries the peer deps the generated forms will
 * import (@angular/forms, ng-base-forms, ng-entity-viewer, ng-link-directives)
 * so your first codegen run builds without dependency surgery.
 *
 * TODO(template): rename the function to Load<YourApp>Client and keep it in
 * sync with mj-app.json "startupExport".
 */
import { LoadVotingOverviewResource } from './lib/overview/overview.resource';

export { VotingOverviewResourceComponent } from './lib/overview/overview.resource';

export function LoadBizAppsVotingClient(): void {
    // Call each component module's anchor so its @RegisterClass decorators run.
    // Importing this module is what triggers the chain; the calls keep a bundler
    // from concluding the modules are unused and dropping them.
    LoadVotingOverviewResource();
}
