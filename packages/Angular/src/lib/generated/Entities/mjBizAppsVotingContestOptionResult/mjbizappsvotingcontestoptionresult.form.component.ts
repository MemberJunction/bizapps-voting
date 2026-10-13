import { Component } from '@angular/core';
import { mjBizAppsVotingContestOptionResultEntity } from '@mj-biz-apps/voting-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Voting: Contest Option Results') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsvotingcontestoptionresult-form',
    templateUrl: './mjbizappsvotingcontestoptionresult.form.component.html'
})
export class mjBizAppsVotingContestOptionResultFormComponent extends BaseFormComponent {
    public record!: mjBizAppsVotingContestOptionResultEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'contestOptionResults', sectionName: 'Contest Option Results', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

