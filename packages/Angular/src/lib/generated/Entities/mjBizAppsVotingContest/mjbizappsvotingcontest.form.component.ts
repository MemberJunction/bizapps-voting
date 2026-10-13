import { Component } from '@angular/core';
import { mjBizAppsVotingContestEntity } from '@mj-biz-apps/voting-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Voting: Contests') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsvotingcontest-form',
    templateUrl: './mjbizappsvotingcontest.form.component.html'
})
export class mjBizAppsVotingContestFormComponent extends BaseFormComponent {
    public record!: mjBizAppsVotingContestEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'contestDetails', sectionName: 'Contest Details', isExpanded: true },
            { sectionKey: 'ballotRules', sectionName: 'Ballot Rules', isExpanded: true },
            { sectionKey: 'tallyAndThresholdRules', sectionName: 'Tally and Threshold Rules', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingBallotSelections', sectionName: 'Ballot Selections', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingContestResults', sectionName: 'Contest Results', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingContestOptions', sectionName: 'Contest Options', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingNominations', sectionName: 'Nominations', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingContestRunningTallies', sectionName: 'Contest Running Tallies', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingBallotComments', sectionName: 'Ballot Comments', isExpanded: false }
        ]);
    }
}

