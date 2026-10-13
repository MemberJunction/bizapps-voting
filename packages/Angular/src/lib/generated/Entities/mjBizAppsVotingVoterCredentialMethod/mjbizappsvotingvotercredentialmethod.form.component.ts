import { Component } from '@angular/core';
import { mjBizAppsVotingVoterCredentialMethodEntity } from '@mj-biz-apps/voting-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Voting: Voter Credential Methods') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsvotingvotercredentialmethod-form',
    templateUrl: './mjbizappsvotingvotercredentialmethod.form.component.html'
})
export class mjBizAppsVotingVoterCredentialMethodFormComponent extends BaseFormComponent {
    public record!: mjBizAppsVotingVoterCredentialMethodEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'methodConfiguration', sectionName: 'Method Configuration', isExpanded: true },
            { sectionKey: 'technicalImplementation', sectionName: 'Technical Implementation', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingVoterCredentials', sectionName: 'Voter Credentials', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingParticipations', sectionName: 'Participations', isExpanded: false }
        ]);
    }
}

