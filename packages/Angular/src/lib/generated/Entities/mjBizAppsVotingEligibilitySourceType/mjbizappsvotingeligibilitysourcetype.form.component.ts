import { Component } from '@angular/core';
import { mjBizAppsVotingEligibilitySourceTypeEntity } from '@mj-biz-apps/voting-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Voting: Eligibility Source Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsvotingeligibilitysourcetype-form',
    templateUrl: './mjbizappsvotingeligibilitysourcetype.form.component.html'
})
export class mjBizAppsVotingEligibilitySourceTypeFormComponent extends BaseFormComponent {
    public record!: mjBizAppsVotingEligibilitySourceTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'sourceConfiguration', sectionName: 'Source Configuration', isExpanded: true },
            { sectionKey: 'implementationDetails', sectionName: 'Implementation Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingElections', sectionName: 'Elections', isExpanded: false }
        ]);
    }
}

