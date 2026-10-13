import { Component } from '@angular/core';
import { mjBizAppsVotingContestOptionEntity } from '@mj-biz-apps/voting-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Voting: Contest Options') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsvotingcontestoption-form',
    templateUrl: './mjbizappsvotingcontestoption.form.component.html'
})
export class mjBizAppsVotingContestOptionFormComponent extends BaseFormComponent {
    public record!: mjBizAppsVotingContestOptionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'contestAssociation', sectionName: 'Contest Association', isExpanded: true },
            { sectionKey: 'optionDetails', sectionName: 'Option Details', isExpanded: true },
            { sectionKey: 'candidateInformation', sectionName: 'Candidate Information', isExpanded: true },
            { sectionKey: 'candidateDocumentsAndMedia', sectionName: 'Candidate Documents and Media', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingContestOptionResults', sectionName: 'Contest Option Results', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingBallotSelections', sectionName: 'Ballot Selections', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingNominations', sectionName: 'Nominations', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingContestRunningTallies', sectionName: 'Contest Running Tallies', isExpanded: false }
        ]);
    }
}

