import { Component } from '@angular/core';
import { mjBizAppsVotingContestResultEntity } from '@mj-biz-apps/voting-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Voting: Contest Results') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsvotingcontestresult-form',
    templateUrl: './mjbizappsvotingcontestresult.form.component.html'
})
export class mjBizAppsVotingContestResultFormComponent extends BaseFormComponent {
    public record!: mjBizAppsVotingContestResultEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'contestAssociation', sectionName: 'Contest Association', isExpanded: true },
            { sectionKey: 'tallyOutcomes', sectionName: 'Tally Outcomes', isExpanded: true },
            { sectionKey: 'votingStatistics', sectionName: 'Voting Statistics', isExpanded: true },
            { sectionKey: 'rankedMethodAndTieBreaks', sectionName: 'Ranked Method and Tie-Breaks', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingContestOptionResults', sectionName: 'Contest Option Results', isExpanded: false }
        ]);
    }
}

