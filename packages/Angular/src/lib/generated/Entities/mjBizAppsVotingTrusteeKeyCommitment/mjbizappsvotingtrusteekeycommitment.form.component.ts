import { Component } from '@angular/core';
import { mjBizAppsVotingTrusteeKeyCommitmentEntity } from '@mj-biz-apps/voting-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Voting: Trustee Key Commitments') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsvotingtrusteekeycommitment-form',
    templateUrl: './mjbizappsvotingtrusteekeycommitment.form.component.html'
})
export class mjBizAppsVotingTrusteeKeyCommitmentFormComponent extends BaseFormComponent {
    public record!: mjBizAppsVotingTrusteeKeyCommitmentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'keyCeremonyDetails', sectionName: 'Key Ceremony Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

