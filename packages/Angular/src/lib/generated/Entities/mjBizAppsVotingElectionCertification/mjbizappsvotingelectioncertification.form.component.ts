import { Component } from '@angular/core';
import { mjBizAppsVotingElectionCertificationEntity } from '@mj-biz-apps/voting-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Voting: Election Certifications') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsvotingelectioncertification-form',
    templateUrl: './mjbizappsvotingelectioncertification.form.component.html'
})
export class mjBizAppsVotingElectionCertificationFormComponent extends BaseFormComponent {
    public record!: mjBizAppsVotingElectionCertificationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'certificationDetails', sectionName: 'Certification Details', isExpanded: true },
            { sectionKey: 'documentationAndHashes', sectionName: 'Documentation and Hashes', isExpanded: true },
            { sectionKey: 'auditAndDisclosures', sectionName: 'Audit and Disclosures', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingElectionCertifiers', sectionName: 'Election Certifiers', isExpanded: false }
        ]);
    }
}

