import { Component } from '@angular/core';
import { mjBizAppsVotingTallyMethodEntity } from '@mj-biz-apps/voting-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Voting: Tally Methods') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsvotingtallymethod-form',
    templateUrl: './mjbizappsvotingtallymethod.form.component.html'
})
export class mjBizAppsVotingTallyMethodFormComponent extends BaseFormComponent {
    public record!: mjBizAppsVotingTallyMethodEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'methodConfiguration', sectionName: 'Method Configuration', isExpanded: true },
            { sectionKey: 'technicalSettings', sectionName: 'Technical Settings', isExpanded: true },
            { sectionKey: 'votingBehavior', sectionName: 'Voting Behavior', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingContests', sectionName: 'Contests', isExpanded: false }
        ]);
    }
}

