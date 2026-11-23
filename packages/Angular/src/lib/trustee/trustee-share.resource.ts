/**
 * VotingTrusteeShareResource — the trustee-facing page for submitting a key share.
 * Deep-links with ?electionId=...; the share is held only in the form and cleared after each attempt.
 */
import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { LogError, RunView } from '@memberjunction/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MJPageLayoutComponent, MJPageHeaderComponent, MJPageBodyComponent, MJButtonDirective } from '@memberjunction/ng-ui-components';
import { VotingApiService } from '../shared/voting-api.service';

interface ElectionPick {
    ID: string;
    Name: string;
    Status: string;
}

interface ShareReceipt {
    Accepted: boolean;
    SharesReceived: number | null;
    SharesRequired: number | null;
    Message: string;
}

@RegisterClass(BaseResourceComponent, 'VotingTrusteeShareResource')
@Component({
    standalone: true,
    imports: [CommonModule, FormsModule, MJPageLayoutComponent, MJPageHeaderComponent, MJPageBodyComponent, MJButtonDirective, SharedGenericModule],
    selector: 'voting-trustee-share-resource',
    template: `
        <mj-page-layout>
            <mj-page-header Title="Trustee Share" Icon="fa-solid fa-key" Subtitle="Submit your key share to open the ballot box"></mj-page-header>
            <mj-page-body [Padding]="true">
                <div class="wrap">
                    @if (IsLoading) {
                        <div class="state-box"><mj-loading text="Loading elections..." size="large"></mj-loading></div>
                    } @else {
                        @if (LoadError) {
                            <div class="banner banner-error" role="alert"><i class="fa-solid fa-circle-exclamation"></i><span>{{ LoadError }}</span></div>
                        }
                        @if (Elections.length === 0 && !LoadError) {
                            <p class="hint empty">No high-assurance election is waiting for key shares.</p>
                        }
                        <form class="card" (ngSubmit)="Submit()">
                            <div class="field">
                                <label for="ts-election">Election</label>
                                <select id="ts-election" name="election" class="input" [(ngModel)]="ElectionId">
                                    <option [ngValue]="null">Choose an election...</option>
                                    @for (e of Elections; track e.ID) {
                                        <option [ngValue]="e.ID">{{ e.Name }} ({{ e.Status }})</option>
                                    }
                                </select>
                            </div>
                            <div class="field">
                                <label for="ts-index">Share index</label>
                                <input id="ts-index" name="index" class="input" type="number" min="1" [(ngModel)]="ShareIndex" autocomplete="off" />
                            </div>
                            <div class="field">
                                <label for="ts-share">Key share</label>
                                <textarea id="ts-share" name="share" class="input mono" rows="4" [(ngModel)]="Share" autocomplete="off" spellcheck="false" aria-describedby="ts-hint"></textarea>
                                <p class="hint" id="ts-hint">Paste the share exactly as you were given it. It is sent securely and not kept on this page after you submit.</p>
                            </div>
                            <div aria-live="polite">
                                @if (Error) {
                                    <div class="banner banner-error" role="alert"><i class="fa-solid fa-circle-exclamation"></i><span>{{ Error }}</span></div>
                                }
                                @if (Receipt) {
                                    <div class="banner" [class.banner-ok]="Receipt.Accepted" [class.banner-warn]="!Receipt.Accepted" role="status">
                                        <i class="fa-solid" [class.fa-circle-check]="Receipt.Accepted" [class.fa-triangle-exclamation]="!Receipt.Accepted"></i>
                                        <span>
                                            {{ Receipt.Accepted ? 'Your share was accepted.' : 'Your share was not accepted.' }}
                                            @if (Receipt.SharesReceived !== null && Receipt.SharesRequired !== null) {
                                                {{ Receipt.SharesReceived }} of {{ Receipt.SharesRequired }} required shares received.
                                            }
                                        </span>
                                    </div>
                                }
                            </div>
                            <button type="submit" mjButton variant="primary" size="md" [disabled]="IsBusy || !CanSubmit">
                                <i class="fa-solid" [class.fa-paper-plane]="!IsBusy" [class.fa-spinner]="IsBusy" [class.fa-spin]="IsBusy"></i> Submit key share
                            </button>
                        </form>
                    }
                </div>
            </mj-page-body>
        </mj-page-layout>
    `,
    styles: [
        `
            :host { display: block; width: 100%; height: 100%; }
            .wrap { max-width: 40rem; margin: 0 auto; }
            .state-box { display: flex; justify-content: center; padding: 3rem 1rem; color: var(--mj-text-muted); }
            .card { background: var(--mj-bg-surface); border: 1px solid var(--mj-border-default); border-radius: 10px; padding: 1.25rem; display: flex; flex-direction: column; gap: 0.5rem; }
            .field { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.5rem; }
            .field label { font-weight: 600; font-size: 0.85rem; color: var(--mj-text-secondary); }
            .input { padding: 0.45rem 0.65rem; border: 1px solid var(--mj-border-default); border-radius: 6px; background: var(--mj-bg-surface); color: var(--mj-text-primary); font: inherit; width: 100%; box-sizing: border-box; }
            .input.mono { font-family: monospace; font-size: 0.85rem; }
            .input:focus-visible { outline: 2px solid var(--mj-border-focus); outline-offset: 1px; }
            .hint.empty { margin: 0 0 0.75rem; }
            .hint { margin: 0; font-size: 0.85rem; color: var(--mj-text-secondary); }
            .banner { display: flex; align-items: center; gap: 0.75rem; padding: 0.7rem 1rem; border-radius: 8px; margin: 0 0 0.75rem; border: 1px solid transparent; }
            .banner span { flex: 1; }
            .banner-error { background: var(--mj-status-error-bg); color: var(--mj-status-error-text); border-color: var(--mj-status-error-border); }
            .banner-warn { background: var(--mj-status-warning-bg); color: var(--mj-status-warning-text); border-color: var(--mj-status-warning-border); }
            .banner-ok { background: var(--mj-status-success-bg); color: var(--mj-status-success-text); border-color: var(--mj-status-success-border); }
        `,
    ],
})
export class VotingTrusteeShareResourceComponent extends BaseResourceComponent implements OnInit {
    private readonly cdr = inject(ChangeDetectorRef);
    public Elections: ElectionPick[] = [];
    public ElectionId: string | null = null;
    public ShareIndex: number | null = null;
    public Share = '';
    public IsLoading = true;
    public LoadError: string | null = null;
    public IsBusy = false;
    public Error: string | null = null;
    public Receipt: ShareReceipt | null = null;

    private readonly api = inject(VotingApiService);

    override async ngOnInit(): Promise<void> {
        super.ngOnInit();
        this.ElectionId = this.GetQueryParams()['electionId'] || null;
        await this.LoadElections();
        this.NotifyLoadComplete();
        this.cdr.detectChanges();
    }

    public get CanSubmit(): boolean {
        return !!this.ElectionId && Number.isInteger(Number(this.ShareIndex)) && Number(this.ShareIndex) >= 1 && this.Share.trim().length > 0;
    }

    private async LoadElections(): Promise<void> {
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const res = await rv.RunView<ElectionPick>({
                EntityName: 'MJ_BizApps_Voting: Elections',
                // Only high-assurance elections have trustees and key shares.
                ExtraFilter: `AssuranceTier='HighAssurance' AND Status NOT IN ('Draft','Cancelled')`,
                ResultType: 'simple',
                Fields: ['ID', 'Name', 'Status'],
                OrderBy: '__mj_CreatedAt DESC',
            });
            if (!res.Success) throw new Error(res.ErrorMessage || 'Elections could not be loaded.');
            this.Elections = res.Results;
        } catch (error) {
            LogError('[VotingTrusteeShare] Failed to load elections', undefined, error);
            this.LoadError = error instanceof Error ? error.message : 'Elections could not be loaded.';
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }

    public async Submit(): Promise<void> {
        if (!this.CanSubmit || !this.ElectionId) return;
        this.IsBusy = true;
        this.Error = null;
        this.Receipt = null;
        try {
            const r = await this.api.SubmitKeyShare({ ElectionID: this.ElectionId, ShareIndex: Number(this.ShareIndex), Share: this.Share.trim() });
            if (r.Output) {
                this.Receipt = {
                    Accepted: r.Output.Accepted === true,
                    SharesReceived: r.Output.SharesReceived ?? null,
                    SharesRequired: r.Output.SharesRequired ?? null,
                    Message: r.Message ?? '',
                };
            }
            if (!r.Success) {
                this.Error = r.Message ?? 'The key share could not be submitted.';
            }
        } finally {
            // The share is never kept after an attempt.
            this.Share = '';
            this.IsBusy = false;
            this.cdr.detectChanges();
        }
    }

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Trustee Share';
    }

    async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-key';
    }
}

export function LoadVotingTrusteeShareResource(): void {
    void VotingTrusteeShareResourceComponent;
}
