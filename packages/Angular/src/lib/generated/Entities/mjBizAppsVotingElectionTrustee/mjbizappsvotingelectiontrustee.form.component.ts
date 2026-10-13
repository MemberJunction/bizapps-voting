import { Component } from '@angular/core';
import { mjBizAppsVotingElectionTrusteeEntity } from '@mj-biz-apps/voting-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Voting: Election Trustees') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsvotingelectiontrustee-form',
    templateUrl: './mjbizappsvotingelectiontrustee.form.component.html'
})
export class mjBizAppsVotingElectionTrusteeFormComponent extends BaseFormComponent {
    public record!: mjBizAppsVotingElectionTrusteeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'trusteeAndElectionInformation', sectionName: 'Trustee and Election Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingTrusteeKeyCommitments', sectionName: 'Trustee Key Commitments', isExpanded: false }
        ]);
    }
}

