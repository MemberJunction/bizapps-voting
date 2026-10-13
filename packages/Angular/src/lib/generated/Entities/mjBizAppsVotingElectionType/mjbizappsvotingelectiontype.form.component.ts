import { Component } from '@angular/core';
import { mjBizAppsVotingElectionTypeEntity } from '@mj-biz-apps/voting-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Voting: Election Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsvotingelectiontype-form',
    templateUrl: './mjbizappsvotingelectiontype.form.component.html'
})
export class mjBizAppsVotingElectionTypeFormComponent extends BaseFormComponent {
    public record!: mjBizAppsVotingElectionTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'electionTypeDetails', sectionName: 'Election Type Details', isExpanded: true },
            { sectionKey: 'driversAndExtensions', sectionName: 'Drivers and Extensions', isExpanded: true },
            { sectionKey: 'presentationAndConfiguration', sectionName: 'Presentation and Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingElections', sectionName: 'Elections', isExpanded: false }
        ]);
    }
}

