import { Component } from '@angular/core';
import { mjBizAppsVotingElectionEntity } from '@mj-biz-apps/voting-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Voting: Elections') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsvotingelection-form',
    templateUrl: './mjbizappsvotingelection.form.component.html'
})
export class mjBizAppsVotingElectionFormComponent extends BaseFormComponent {
    public record!: mjBizAppsVotingElectionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'electionDetails', sectionName: 'Election Details', isExpanded: true },
            { sectionKey: 'securityAndVerification', sectionName: 'Security and Verification', isExpanded: true },
            { sectionKey: 'voterEligibilityAndRoll', sectionName: 'Voter Eligibility and Roll', isExpanded: true },
            { sectionKey: 'scheduleAndDeadlines', sectionName: 'Schedule and Deadlines', isExpanded: true },
            { sectionKey: 'votingRulesAndResults', sectionName: 'Voting Rules and Results', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingProxyDesignations', sectionName: 'Proxy Designations', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingContests', sectionName: 'Contests', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingParticipations', sectionName: 'Participations', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingElectionAnchors', sectionName: 'Election Anchors', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingElectionTrustees', sectionName: 'Election Trustees', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingCastBallots', sectionName: 'Cast Ballots', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingElectionAuditEvents', sectionName: 'Election Audit Events', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingResultSnapshots', sectionName: 'Result Snapshots', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingEligibleVoters', sectionName: 'Eligible Voters', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingElectionCertifications', sectionName: 'Election Certifications', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingBallotDistributions', sectionName: 'Ballot Distributions', isExpanded: false }
        ]);
    }
}

