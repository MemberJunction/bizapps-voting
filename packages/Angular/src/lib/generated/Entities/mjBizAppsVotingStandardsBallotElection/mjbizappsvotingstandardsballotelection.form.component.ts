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
            { sectionKey: 'standardsDocumentDetails', sectionName: 'Standards Document Details', isExpanded: true },
            { sectionKey: 'ballotRecirculation', sectionName: 'Ballot Recirculation', isExpanded: true },
            { sectionKey: 'electionDetails', sectionName: 'Election Details', isExpanded: true },
            { sectionKey: 'electionSecurityAndRules', sectionName: 'Election Security and Rules', isExpanded: true },
            { sectionKey: 'voterEligibility', sectionName: 'Voter Eligibility', isExpanded: true },
            { sectionKey: 'electionTimeline', sectionName: 'Election Timeline', isExpanded: true },
            { sectionKey: 'resultsAndQuorumConfiguration', sectionName: 'Results and Quorum Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

