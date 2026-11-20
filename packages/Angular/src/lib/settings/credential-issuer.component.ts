/**
 * CredentialIssuerComponent — issues voter credentials for an election, one sign-in method at a
 * time (Voting.IssueCredentials). Control-number display lives in the Elections dashboard's
 * credentials tab; this panel only issues and reports counts, and links there.
 */
import { Component, EventEmitter, Input, OnChanges, Output, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LogError } from '@memberjunction/core';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { VotingIssueCredentialsOperation } from '@mj-biz-apps/voting-entities';
import { UnwrapOperation } from '../results/op-result';
import type { SignInMethodOption } from './distribution-editor.component';

@Component({
    selector: 'voting-credential-issuer',
    standalone: true,
    imports: [CommonModule, FormsModule, MJButtonDirective],
    template: `
        <section class="issuer" aria-labelledby="issue-heading">
            <h3 id="issue-heading"><i class="fa-solid fa-envelope-open-text"></i> Issue voter credentials</h3>
            <p class="hint">
                Sends or generates sign-in credentials for every eligible, unchallenged voter on the election's roll using the chosen method.
                Voters who already hold a credential for the method are skipped.
            </p>

            @if (Methods.length === 0) {
                <p class="muted">No active sign-in methods are available for issuance.</p>
            } @else {
                <div class="row">
                    <div class="field">
                        <label for="issue-method">Sign-in method</label>
                        <select id="issue-method" class="input" [(ngModel)]="MethodCode" (ngModelChange)="Reset()">
                            @for (m of Methods; track m.Code) {
                                <option [value]="m.Code">{{ m.Name }} ({{ m.Code }})</option>
                            }
                        </select>
                    </div>
                    <div class="field grow">
                        <label for="issue-base">Ballot link base URL</label>
                        <input id="issue-base" class="input mono" type="url" [(ngModel)]="BaseUrl" (ngModelChange)="Reset()" aria-describedby="issue-base-hint" />
                        <p class="hint" id="issue-base-hint">Links in emails open this address. Defaults to the selected distribution's public page.</p>
                    </div>
                </div>

                <div class="actions">
                    @if (!Confirming) {
                        <button type="button" mjButton variant="primary" size="sm" (click)="Confirming = true" [disabled]="IsBusy || !MethodCode">
                            <i class="fa-solid fa-paper-plane"></i> Issue credentials
                        </button>
                    } @else {
                        <span class="confirm-text">This will issue credentials to all eligible voters. Continue?</span>
                        <button type="button" mjButton variant="primary" size="sm" (click)="Issue()" [disabled]="IsBusy">
                            <i class="fa-solid" [class.fa-check]="!IsBusy" [class.fa-spinner]="IsBusy" [class.fa-spin]="IsBusy"></i> Yes, issue
                        </button>
                        <button type="button" mjButton variant="secondary" size="sm" (click)="Confirming = false" [disabled]="IsBusy">Cancel</button>
                    }
                    <button type="button" mjButton variant="secondary" size="sm" (click)="OpenElection.emit()">
                        <i class="fa-solid fa-up-right-from-square"></i> Credentials and control numbers
                    </button>
                </div>
            }

            <div aria-live="polite">
                @if (ErrorMessage) {
                    <div class="banner banner-error" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ ErrorMessage }}</div>
                }
                @if (Result) {
                    <div class="banner banner-ok">
                        <i class="fa-solid fa-circle-check"></i>
                        Issued {{ Result.Issued }} {{ Result.Issued === 1 ? 'credential' : 'credentials' }}; skipped {{ Result.Skipped }}.
                    </div>
                }
            </div>
        </section>
    `,
    styles: [
        `
            :host { display: block; }
            .issuer { background: var(--mj-bg-surface); border: 1px solid var(--mj-border-default); border-radius: 10px; padding: 1rem 1.25rem; }
            h3 { margin: 0 0 0.35rem; color: var(--mj-text-primary); font-size: 1.05rem; }
            h3 i { color: var(--mj-brand-primary); margin-right: 0.35rem; }
            .hint { margin: 0.15rem 0 0.5rem; font-size: 0.85rem; color: var(--mj-text-secondary); }
            .row { display: flex; gap: 1rem; flex-wrap: wrap; }
            .field { display: flex; flex-direction: column; gap: 0.25rem; min-width: 14rem; }
            .field.grow { flex: 1; }
            label { font-weight: 600; font-size: 0.85rem; color: var(--mj-text-secondary); }
            .input { padding: 0.45rem 0.65rem; border: 1px solid var(--mj-border-default); border-radius: 6px; background: var(--mj-bg-surface); color: var(--mj-text-primary); font: inherit; }
            .input.mono { font-family: monospace; font-size: 0.85rem; }
            .input:focus-visible { outline: 2px solid var(--mj-border-focus); outline-offset: 1px; }
            .actions { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin-top: 0.5rem; }
            .confirm-text { color: var(--mj-status-warning-text); font-size: 0.9rem; }
            .banner { display: flex; gap: 0.6rem; align-items: center; padding: 0.6rem 0.8rem; border-radius: 8px; margin-top: 0.75rem; border: 1px solid transparent; }
            .banner-error { background: var(--mj-status-error-bg); color: var(--mj-status-error-text); border-color: var(--mj-status-error-border); }
            .banner-ok { background: var(--mj-status-success-bg); color: var(--mj-status-success-text); border-color: var(--mj-status-success-border); }
            .muted { color: var(--mj-text-muted); }
        `,
    ],
})
export class CredentialIssuerComponent implements OnChanges {
    private readonly cdr = inject(ChangeDetectorRef);
    @Input({ required: true }) ElectionID!: string;
    @Input() Methods: SignInMethodOption[] = [];
    @Input() set DefaultBaseUrl(value: string) {
        this.BaseUrl = value;
    }
    @Output() OpenElection = new EventEmitter<void>();

    public MethodCode = '';
    public BaseUrl = '';
    public Confirming = false;
    public IsBusy = false;
    public ErrorMessage: string | null = null;
    public Result: { Issued: number; Skipped: number } | null = null;

    ngOnChanges(): void {
        if (!this.MethodCode && this.Methods.length > 0) {
            this.MethodCode = this.Methods[0].Code;
        }
    }

    public Reset(): void {
        this.Confirming = false;
        this.ErrorMessage = null;
        this.Result = null;
    }

    public async Issue(): Promise<void> {
        this.IsBusy = true;
        this.ErrorMessage = null;
        this.Result = null;
        try {
            const res = await new VotingIssueCredentialsOperation().Execute({
                ElectionID: this.ElectionID,
                MethodCode: this.MethodCode,
                BaseUrl: this.BaseUrl.trim() || undefined,
            });
            const unwrapped = UnwrapOperation(res, 'Credentials could not be issued.');
            if (unwrapped.Error || !unwrapped.Output) {
                this.ErrorMessage = unwrapped.Error;
                return;
            }
            this.Result = { Issued: unwrapped.Output.Issued ?? 0, Skipped: unwrapped.Output.Skipped ?? 0 };
            this.Confirming = false;
        } catch (error) {
            LogError('[VotingSettings] Issue credentials failed', undefined, error);
            this.ErrorMessage = error instanceof Error ? error.message : 'Credentials could not be issued.';
        } finally {
            this.IsBusy = false;
            this.cdr.detectChanges();
        }
    }
}
