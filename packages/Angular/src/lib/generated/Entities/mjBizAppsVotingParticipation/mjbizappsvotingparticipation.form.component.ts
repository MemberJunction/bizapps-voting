import { Component } from '@angular/core';
import { mjBizAppsVotingParticipationEntity } from '@mj-biz-apps/voting-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Voting: Participations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsvotingparticipation-form',
    templateUrl: './mjbizappsvotingparticipation.form.component.html'
})
export class mjBizAppsVotingParticipationFormComponent extends BaseFormComponent {
    public record!: mjBizAppsVotingParticipationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'electionAndVotingDetails', sectionName: 'Election and Voting Details', isExpanded: true },
            { sectionKey: 'verificationAndStaffing', sectionName: 'Verification and Staffing', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingBallotAttributions', sectionName: 'Ballot Attributions', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingBallotComments', sectionName: 'Ballot Comments', isExpanded: false }
        ]);
    }
}

