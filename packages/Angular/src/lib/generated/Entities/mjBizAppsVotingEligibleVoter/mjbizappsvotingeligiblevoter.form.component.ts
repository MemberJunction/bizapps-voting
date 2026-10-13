import { Component } from '@angular/core';
import { mjBizAppsVotingEligibleVoterEntity } from '@mj-biz-apps/voting-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Voting: Eligible Voters') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsvotingeligiblevoter-form',
    templateUrl: './mjbizappsvotingeligiblevoter.form.component.html'
})
export class mjBizAppsVotingEligibleVoterFormComponent extends BaseFormComponent {
    public record!: mjBizAppsVotingEligibleVoterEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'electionVoterContext', sectionName: 'Election & Voter Context', isExpanded: true },
            { sectionKey: 'voterProfileWeight', sectionName: 'Voter Profile & Weight', isExpanded: true },
            { sectionKey: 'rollStatusAudit', sectionName: 'Roll Status & Audit', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingParticipations', sectionName: 'Participations', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingProxyDesignations', sectionName: 'Proxy Designations', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingVoterCredentials', sectionName: 'Voter Credentials', isExpanded: false }
        ]);
    }
}

