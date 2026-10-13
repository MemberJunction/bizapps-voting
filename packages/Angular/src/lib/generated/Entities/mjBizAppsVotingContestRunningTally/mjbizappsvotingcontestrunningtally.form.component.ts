import { Component } from '@angular/core';
import { mjBizAppsVotingContestRunningTallyEntity } from '@mj-biz-apps/voting-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Voting: Contest Running Tallies') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsvotingcontestrunningtally-form',
    templateUrl: './mjbizappsvotingcontestrunningtally.form.component.html'
})
export class mjBizAppsVotingContestRunningTallyFormComponent extends BaseFormComponent {
    public record!: mjBizAppsVotingContestRunningTallyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'contestInformation', sectionName: 'Contest Information', isExpanded: true },
            { sectionKey: 'tallyMetrics', sectionName: 'Tally Metrics', isExpanded: true }
        ]);
    }
}

