/**
 * The scaffold's ONE runnable page — a resource component that renders as a tab in
 * MJ Explorer.
 *
 * It exists to prove the wiring, because every link in the Explorer-visibility chain
 * fails SILENTLY and there is no error to debug when one is wrong:
 *
 *   1. @RegisterClass(BaseResourceComponent, 'VotingOverviewResource')  <- this file
 *   2. exported from ../../public-api.ts, so the bundler can't tree-shake it away
 *   3. metadata/applications/ nav item with the SAME DriverClass string
 *   4. MJExplorer imports this package (installed: the CLI maintains the generated
 *      bootstrap file; dev-linked: you add the import yourself)
 *
 * Full chain + a "nothing shows up" checklist:
 *   docs/template-docs/explorer-visibility.md
 *
 * TODO(template): this is a placeholder — replace the template below with your app's
 * real landing page (or delete this file and the metadata/applications record if your
 * app ships no UI). `pnpm run init` renames the class + DriverClass for you.
 */
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

@RegisterClass(BaseResourceComponent, 'VotingOverviewResource')
@Component({
    standalone: true,
    imports: [CommonModule],
    selector: 'voting-overview-resource',
    template: `
        <div class="voting-overview">
            <h2><i class="fa-solid fa-cube"></i> {{ appName }}</h2>
            <p>
                This page is the MemberJunction Open App scaffold's placeholder. Seeing it
                means the whole chain works: the component is registered, it survived the
                bundle, the nav item's <code>DriverClass</code> matched it, and your app's
                <code>MJ: Applications</code> record is visible to your user.
            </p>
            <p>
                Replace it with your own page in
                <code>packages/Angular/src/lib/</code>, then point the nav item in
                <code>metadata/applications/</code> at it.
            </p>
        </div>
    `,
    styles: [`
        :host { display: block; width: 100%; height: 100%; }
        .voting-overview { padding: 1.5rem; max-width: 46rem; }
        .voting-overview h2 { margin: 0 0 .75rem; font-size: 1.25rem; }
        .voting-overview p { margin: 0 0 .75rem; line-height: 1.5; }
        .voting-overview code { padding: .1rem .3rem; border-radius: 3px; background: rgba(127,127,127,.18); }
    `],
})
export class VotingOverviewResourceComponent extends BaseResourceComponent implements OnInit {
    public appName = 'MJ_BizApps_Voting';

    /**
     * NotifyLoadComplete() is NOT optional. Explorer blocks its loading screen on that
     * signal; a resource that never sends it is only released by the base class's
     * watchdog, seconds later. Always call super.ngOnInit() first.
     */
    override ngOnInit(): void {
        super.ngOnInit();
        this.NotifyLoadComplete();
    }

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Overview';
    }

    async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-cube';
    }
}

/**
 * Tree-shaking anchor. A decorator only runs if the module is evaluated, and a module
 * is only evaluated if something references it — so the client bootstrap calls this.
 */
export function LoadVotingOverviewResource(): void {
    void VotingOverviewResourceComponent;
}
