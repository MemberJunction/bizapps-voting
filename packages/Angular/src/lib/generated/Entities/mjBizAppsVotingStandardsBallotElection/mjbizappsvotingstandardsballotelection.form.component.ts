import { Component } from '@angular/core';
import { mjBizAppsVotingStandardsBallotElectionEntity } from '@mj-biz-apps/voting-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Voting: Standards Ballot Elections') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsvotingstandardsballotelection-form',
    templateUrl: './mjbizappsvotingstandardsballotelection.form.component.html'
})
export class mjBizAppsVotingStandardsBallotElectionFormComponent extends BaseFormComponent {
    public record!: mjBizAppsVotingStandardsBallotElectionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'documentDetails', sectionName: 'Document Details', isExpanded: true },
            { sectionKey: 'ballotRecirculationSettings', sectionName: 'Ballot & Recirculation Settings', isExpanded: true },
            { sectionKey: 'electionDetails', sectionName: 'Election Details', isExpanded: true },
            { sectionKey: 'electionConfiguration', sectionName: 'Election Configuration', isExpanded: true },
            { sectionKey: 'electionTimeline', sectionName: 'Election Timeline', isExpanded: true },
            { sectionKey: 'resultsAndRules', sectionName: 'Results and Rules', isExpanded: true },
            { sectionKey: 'securityAndVerification', sectionName: 'Security and Verification', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

