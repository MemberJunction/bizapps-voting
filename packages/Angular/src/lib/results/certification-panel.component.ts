/**
 * CertificationPanelComponent — shows an election's certification record (status, certifiers,
 * roll and ballot-set hashes, results-timing disclosure) and lets an administrator or inspector
 * certify a tallied election via Voting.Certify.
 */
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IMetadataProvider, LogError, Metadata, RunView } from '@memberjunction/core';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { VotingCertifyOperation } from '@mj-biz-apps/voting-entities';
import { UnwrapOperation } from './op-result';
import type { CertificationView, CertifierView } from './results-report';

interface CertificationRow {
    ID: string;
    Status: string;
    CertifiedAt: Date | null;
    RollHash: string | null;
    BallotSetHash: string | null;
    ResultsTimingDisclosure: string | null;
    Notes: string | null;
    __mj_CreatedAt: Date;
}

interface CertifierRow {
    ID: string;
    ElectionCertificationID: string;
    Person: string;
    Role: string | null;
    SignedAt: Date | null;
}

@Component({
    selector: 'voting-certification-panel',
    standalone: true,
    imports: [CommonModule, FormsModule, MJButtonDirective],
    template: `
        <section class="panel" aria-labelledby="cert-heading">
            <header class="head">
                <h3 id="cert-heading"><i class="fa-solid fa-certificate"></i> Certification</h3>
                @if (Certification) {
                    <span class="chip" [ngClass]="StatusClass">{{ Certification.Status }}</span>
                }
            </header>

            @if (IsLoading) {
                <p class="muted"><i class="fa-solid fa-spinner fa-spin"></i> Loading certification...</p>
            } @else {
                @if (LoadError) {
                    <div class="banner banner-error" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ LoadError }}</div>
                }

                @if (Certification) {
                    <dl class="facts">
                        <div><dt>Certified at</dt><dd>{{ Certification.CertifiedAt ? (Certification.CertifiedAt | date: 'medium') : 'Not yet certified' }}</dd></div>
                        <div><dt>Voter roll hash</dt><dd><code>{{ Certification.RollHash || 'n/a' }}</code></dd></div>
                        <div><dt>Ballot set hash</dt><dd><code>{{ Certification.BallotSetHash || 'n/a' }}</code></dd></div>
                        <div class="wide"><dt>Results timing disclosure</dt><dd>{{ Certification.ResultsTimingDisclosure || ResultsTimingFallback }}</dd></div>
                        @if (Certification.Notes) {
                            <div class="wide"><dt>Notes</dt><dd>{{ Certification.Notes }}</dd></div>
                        }
                    </dl>

                    <h4>Certifiers</h4>
                    @if (Certification.Certifiers.length === 0) {
                        <p class="muted">No certifiers have signed yet.</p>
                    } @else {
                        <table class="grid">
                            <thead>
                                <tr><th scope="col">Person</th><th scope="col">Role</th><th scope="col">Signed</th></tr>
                            </thead>
                            <tbody>
                                @for (c of Certification.Certifiers; track c.ID) {
                                    <tr>
                                        <th scope="row">{{ c.PersonName }}</th>
                                        <td>{{ c.Role || 'n/a' }}</td>
                                        <td>{{ c.SignedAt ? (c.SignedAt | date: 'medium') : 'Pending' }}</td>
                                    </tr>
                                }
                            </tbody>
                        </table>
                    }
                } @else {
                    <p class="muted">This election has not been certified.</p>
                    <p class="muted small">Results timing that will be disclosed in the certification report: {{ ResultsTimingFallback }}</p>
                }

                @if (CanCertify && ElectionStatus === 'Tallied') {
                    <div class="certify">
                        <label for="cert-notes">Certification notes (optional)</label>
                        <textarea id="cert-notes" rows="2" class="input" [(ngModel)]="Notes" [disabled]="IsCertifying"></textarea>
                        <div class="actions">
                            @if (!ConfirmingCertify) {
                                <button type="button" mjButton variant="primary" size="sm" (click)="ConfirmingCertify = true" [disabled]="IsCertifying">
                                    <i class="fa-solid fa-stamp"></i> Certify results
                                </button>
                            } @else {
                                <span class="confirm-text">Certifying locks the tally and records the roll and ballot hashes. Continue?</span>
                                <button type="button" mjButton variant="primary" size="sm" (click)="Certify()" [disabled]="IsCertifying">
                                    <i class="fa-solid" [class.fa-check]="!IsCertifying" [class.fa-spinner]="IsCertifying" [class.fa-spin]="IsCertifying"></i> Yes, certify
                                </button>
                                <button type="button" mjButton variant="secondary" size="sm" (click)="ConfirmingCertify = false" [disabled]="IsCertifying">Cancel</button>
                            }
                        </div>
                    </div>
                } @else if (CanCertify && !Certification) {
                    <p class="muted small">Certification is available once the election has been tallied (current status: {{ ElectionStatus }}).</p>
                }

                <div aria-live="polite">
                    @if (ActionError) {
                        <div class="banner banner-error" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ ActionError }}</div>
                    }
                    @if (ActionSuccess) {
                        <div class="banner banner-ok"><i class="fa-solid fa-circle-check"></i> {{ ActionSuccess }}</div>
                    }
                </div>
            }
        </section>
    `,
    styles: [
        `
            :host { display: block; }
            .panel { background: var(--mj-bg-surface); border: 1px solid var(--mj-border-default); border-radius: 10px; padding: 1rem 1.25rem; }
            .head { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
            h3 { margin: 0; font-size: 1.05rem; color: var(--mj-text-primary); }
            h3 i { color: var(--mj-brand-primary); margin-right: 0.35rem; }
            h4 { margin: 1rem 0 0.25rem; color: var(--mj-text-primary); }
            .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); gap: 0.75rem 1.5rem; margin: 0.75rem 0 0; }
            .facts .wide { grid-column: 1 / -1; }
            .facts dt { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--mj-text-muted); }
            .facts dd { margin: 0.15rem 0 0; color: var(--mj-text-primary); word-break: break-all; }
            code { padding: 0.1rem 0.4rem; background: var(--mj-bg-surface-sunken); border-radius: 4px; font-size: 0.8em; }
            .grid { width: 100%; border-collapse: collapse; }
            .grid th, .grid td { padding: 0.45rem 0.65rem; text-align: left; border-bottom: 1px solid var(--mj-border-subtle); color: var(--mj-text-primary); }
            .grid thead th { background: var(--mj-bg-surface-card); color: var(--mj-text-secondary); font-size: 0.75rem; text-transform: uppercase; }
            .chip { padding: 0.15rem 0.7rem; border-radius: 999px; font-size: 0.8rem; font-weight: 700; }
            .chip-ok { background: var(--mj-status-success-bg); color: var(--mj-status-success-text); }
            .chip-warn { background: var(--mj-status-warning-bg); color: var(--mj-status-warning-text); }
            .chip-bad { background: var(--mj-status-error-bg); color: var(--mj-status-error-text); }
            .certify { margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid var(--mj-border-subtle); display: flex; flex-direction: column; gap: 0.5rem; }
            .certify label { font-weight: 600; color: var(--mj-text-secondary); font-size: 0.85rem; }
            .input { padding: 0.45rem 0.65rem; border: 1px solid var(--mj-border-default); border-radius: 6px; background: var(--mj-bg-surface); color: var(--mj-text-primary); font: inherit; resize: vertical; }
            .input:focus-visible { outline: 2px solid var(--mj-border-focus); outline-offset: 1px; }
            .actions { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
            .confirm-text { color: var(--mj-status-warning-text); font-size: 0.9rem; }
            .banner { display: flex; gap: 0.6rem; align-items: center; padding: 0.6rem 0.8rem; border-radius: 8px; margin-top: 0.75rem; border: 1px solid transparent; }
            .banner-error { background: var(--mj-status-error-bg); color: var(--mj-status-error-text); border-color: var(--mj-status-error-border); }
            .banner-ok { background: var(--mj-status-success-bg); color: var(--mj-status-success-text); border-color: var(--mj-status-success-border); }
            .muted { color: var(--mj-text-muted); }
            .small { font-size: 0.85rem; }
            @media print { .certify, .actions { display: none; } }
        `,
    ],
})
export class CertificationPanelComponent implements OnChanges {
    private readonly cdr = inject(ChangeDetectorRef);
    @Input({ required: true }) ElectionID!: string;
    @Input() ElectionStatus = '';
    /** Plain-language results timing for the election, used when no disclosure was recorded. */
    @Input() ResultsTimingFallback = '';
    @Input() CanCertify = false;
    @Input() Provider: IMetadataProvider | null = null;
    /** Emits the loaded certification (or null) so the parent can include it in a printed report. */
    @Output() CertificationLoaded = new EventEmitter<CertificationView | null>();
    /** Emits after a successful Voting.Certify. */
    @Output() Certified = new EventEmitter<void>();

    public Certification: CertificationView | null = null;
    public IsLoading = false;
    public LoadError: string | null = null;
    public ActionError: string | null = null;
    public ActionSuccess: string | null = null;
    public Notes = '';
    public IsCertifying = false;
    public ConfirmingCertify = false;

    async ngOnChanges(changes: SimpleChanges): Promise<void> {
        if (changes['ElectionID']) {
            this.ActionError = null;
            this.ActionSuccess = null;
            this.ConfirmingCertify = false;
            await this.Load();
        }
        this.cdr.detectChanges();
    }

    public get StatusClass(): string {
        switch (this.Certification?.Status) {
            case 'Certified':
                return 'chip-ok';
            case 'Revoked':
                return 'chip-bad';
            default:
                return 'chip-warn';
        }
    }

    public async Load(): Promise<void> {
        this.IsLoading = true;
        this.LoadError = null;
        try {
            const rv = RunView.FromMetadataProvider(this.Provider ?? Metadata.Provider);
            const certRes = await rv.RunView<CertificationRow>({
                EntityName: 'MJ_BizApps_Voting: Election Certifications',
                ExtraFilter: `ElectionID='${this.ElectionID}'`,
                OrderBy: '__mj_CreatedAt DESC',
                ResultType: 'simple',
                Fields: ['ID', 'Status', 'CertifiedAt', 'RollHash', 'BallotSetHash', 'ResultsTimingDisclosure', 'Notes', '__mj_CreatedAt'],
            });
            if (!certRes.Success) {
                throw new Error(certRes.ErrorMessage || 'Certification records could not be loaded.');
            }
            const latest = certRes.Results[0];
            if (!latest) {
                this.Certification = null;
            } else {
                const certifierRes = await rv.RunView<CertifierRow>({
                    EntityName: 'MJ_BizApps_Voting: Election Certifiers',
                    ExtraFilter: `ElectionCertificationID='${latest.ID}'`,
                    OrderBy: '__mj_CreatedAt',
                    ResultType: 'simple',
                    Fields: ['ID', 'ElectionCertificationID', 'Person', 'Role', 'SignedAt'],
                });
                if (!certifierRes.Success) {
                    throw new Error(certifierRes.ErrorMessage || 'Certifiers could not be loaded.');
                }
                const certifiers: CertifierView[] = certifierRes.Results.map((c) => ({
                    ID: c.ID,
                    PersonName: c.Person,
                    Role: c.Role ?? '',
                    SignedAt: c.SignedAt ? new Date(c.SignedAt) : null,
                }));
                this.Certification = {
                    ID: latest.ID,
                    Status: latest.Status,
                    CertifiedAt: latest.CertifiedAt ? new Date(latest.CertifiedAt) : null,
                    RollHash: latest.RollHash ?? '',
                    BallotSetHash: latest.BallotSetHash ?? '',
                    ResultsTimingDisclosure: latest.ResultsTimingDisclosure ?? '',
                    Notes: latest.Notes ?? '',
                    Certifiers: certifiers,
                };
            }
        } catch (error) {
            LogError('[VotingResults] Failed to load certification', undefined, error);
            this.LoadError = error instanceof Error ? error.message : 'Certification could not be loaded.';
            this.Certification = null;
        } finally {
            this.IsLoading = false;
            this.CertificationLoaded.emit(this.Certification);
            this.cdr.detectChanges();
        }
    }

    public async Certify(): Promise<void> {
        this.IsCertifying = true;
        this.ActionError = null;
        this.ActionSuccess = null;
        try {
            const res = await new VotingCertifyOperation().Execute({
                ElectionID: this.ElectionID,
                Notes: this.Notes.trim() || undefined,
            });
            const unwrapped = UnwrapOperation(res, 'The election could not be certified.');
            if (unwrapped.Error) {
                this.ActionError = unwrapped.Error;
                return;
            }
            this.ActionSuccess = 'The election has been certified.';
            this.ConfirmingCertify = false;
            this.Notes = '';
            await this.Load();
            this.Certified.emit();
        } catch (error) {
            LogError('[VotingResults] Certify failed', undefined, error);
            this.ActionError = error instanceof Error ? error.message : 'The election could not be certified.';
        } finally {
            this.IsCertifying = false;
            this.cdr.detectChanges();
        }
    }
}
