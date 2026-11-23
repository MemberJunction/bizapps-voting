import { Component } from '@angular/core';
import { mjBizAppsVotingBallotAttributionEntity } from '@mj-biz-apps/voting-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Voting: Ballot Attributions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsvotingballotattribution-form',
    templateUrl: './mjbizappsvotingballotattribution.form.component.html'
})
export class mjBizAppsVotingBallotAttributionFormComponent extends BaseFormComponent {
    public record!: mjBizAppsVotingBallotAttributionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'ballotInformation', sectionName: 'Ballot Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

