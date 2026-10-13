/**
 * CertificationTab — certification status for the election, with the Certify action, and a link to the
 * Results & Certification page where the printable report and receipt verification live.
 */
import { Component, EventEmitter, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationService } from '@memberjunction/ng-shared';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { BaseElectionAdminTab } from '@mj-biz-apps/voting-ng-widgets';
import { CertificationPanelComponent } from '../../results/certification-panel.component';
import { ELECTION_COMMON_STYLES } from '../election-styles';

@Component({
    selector: 'election-certification-tab',
    standalone: true,
    imports: [CommonModule, MJButtonDirective, CertificationPanelComponent],
    template: `
        <voting-certification-panel
            [ElectionID]="ElectionID"
            [ElectionStatus]="ElectionStatus"
            [ResultsTimingFallback]="'Disclosed in the certification report.'"
            [CanCertify]="IsAdministrator"
            [Provider]="ProviderToUse"
            (Certified)="Changed.emit()"
        ></voting-certification-panel>
        <div class="actions">
            <button type="button" mjButton variant="secondary" size="sm" (click)="OpenResults()">
                <i class="fa-solid fa-chart-column"></i> Open Results &amp; Certification
            </button>
        </div>
    `,
    styles: [ELECTION_COMMON_STYLES],
})
export class CertificationTabComponent extends BaseElectionAdminTab {
    private readonly navService = inject(NavigationService, { optional: true });

    @Output() Changed = new EventEmitter<void>();

    public OpenResults(): void {
        void this.navService?.OpenNavItemByName('Results & Certification', { queryParams: { electionId: this.ElectionID } });
    }
}
