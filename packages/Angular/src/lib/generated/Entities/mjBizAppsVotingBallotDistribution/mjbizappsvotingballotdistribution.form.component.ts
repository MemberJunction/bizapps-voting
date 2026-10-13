import { Component } from '@angular/core';
import { mjBizAppsVotingBallotDistributionEntity } from '@mj-biz-apps/voting-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Voting: Ballot Distributions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsvotingballotdistribution-form',
    templateUrl: './mjbizappsvotingballotdistribution.form.component.html'
})
export class mjBizAppsVotingBallotDistributionFormComponent extends BaseFormComponent {
    public record!: mjBizAppsVotingBallotDistributionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'ballotInformation', sectionName: 'Ballot Information', isExpanded: true },
            { sectionKey: 'securityAndEmbedding', sectionName: 'Security and Embedding', isExpanded: true },
            { sectionKey: 'customization', sectionName: 'Customization', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

