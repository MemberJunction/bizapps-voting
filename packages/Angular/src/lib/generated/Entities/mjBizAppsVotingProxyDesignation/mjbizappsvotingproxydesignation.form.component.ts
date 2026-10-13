import { Component } from '@angular/core';
import { mjBizAppsVotingProxyDesignationEntity } from '@mj-biz-apps/voting-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Voting: Proxy Designations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsvotingproxydesignation-form',
    templateUrl: './mjbizappsvotingproxydesignation.form.component.html'
})
export class mjBizAppsVotingProxyDesignationFormComponent extends BaseFormComponent {
    public record!: mjBizAppsVotingProxyDesignationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'proxyInformation', sectionName: 'Proxy Information', isExpanded: true },
            { sectionKey: 'votingInstructionsAndScope', sectionName: 'Voting Instructions and Scope', isExpanded: true },
            { sectionKey: 'statusAndTimeline', sectionName: 'Status and Timeline', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingParticipations', sectionName: 'Participations', isExpanded: false }
        ]);
    }
}

