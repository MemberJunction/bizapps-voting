import { Component } from '@angular/core';
import { mjBizAppsVotingElectionCertifierEntity } from '@mj-biz-apps/voting-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Voting: Election Certifiers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsvotingelectioncertifier-form',
    templateUrl: './mjbizappsvotingelectioncertifier.form.component.html'
})
export class mjBizAppsVotingElectionCertifierFormComponent extends BaseFormComponent {
    public record!: mjBizAppsVotingElectionCertifierEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'certificationDetails', sectionName: 'Certification Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

