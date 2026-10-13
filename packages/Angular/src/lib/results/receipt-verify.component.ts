/**
 * ReceiptVerifyComponent — lets a voter (or auditor) check that a receipt code corresponds to a
 * counted ballot in an election, via Voting.VerifyReceipt. The receipt reveals nothing about
 * the choices made.
 */
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LogError } from '@memberjunction/core';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { UnwrapOperation } from './op-result';
import { IsReceiptCode, VotingVerifyReceiptOperation, type VotingVerifyReceiptOutput } from '@mj-biz-apps/voting-entities';

@Component({
    selector: 'voting-receipt-verify',
    standalone: true,
    imports: [CommonModule, FormsModule, MJButtonDirective],
    template: `
        <section class="verify" aria-labelledby="verify-heading">
            <h3 id="verify-heading"><i class="fa-solid fa-receipt"></i> Verify a receipt</h3>
            <p class="hint">Enter the receipt code shown after a ballot was cast to confirm it was recorded and counted. The receipt does not reveal how anyone voted.</p>
            <form class="row" (ngSubmit)="Verify()">
                <label for="receipt-code" class="sr-only">Receipt code</label>
                <input
                    id="receipt-code"
                    name="receiptCode"
                    type="text"
                    class="input"
                    autocomplete="off"
                    spellcheck="false"
                    placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
                    [(ngModel)]="Code"
                    (ngModelChange)="OnCodeChanged()"
                    [attr.aria-invalid]="CodeInvalid"
                    aria-describedby="receipt-status"
                />
                <button type="submit" mjButton variant="primary" size="sm" [disabled]="IsBusy || !Code.trim()">
                    <i class="fa-solid" [class.fa-magnifying-glass]="!IsBusy" [class.fa-spinner]="IsBusy" [class.fa-spin]="IsBusy"></i> Verify
                </button>
            </form>
            <div id="receipt-status" aria-live="polite">
                @if (CodeInvalid) {
                    <p class="status status-error"><i class="fa-solid fa-circle-exclamation"></i> That is not a valid receipt code format (20 characters in groups of four).</p>
                } @else if (ErrorMessage) {
                    <p class="status status-error"><i class="fa-solid fa-circle-exclamation"></i> {{ ErrorMessage }}</p>
                } @else if (Result) {
                    @if (Result.Found && Result.Counted) {
                        <p class="status status-ok"><i class="fa-solid fa-circle-check"></i> Receipt found. The ballot was recorded and is included in the count.</p>
                    } @else if (Result.Found) {
                        <p class="status status-warn"><i class="fa-solid fa-triangle-exclamation"></i> Receipt found, but the ballot is not (yet) counted.</p>
                    } @else {
                        <p class="status status-error"><i class="fa-solid fa-circle-xmark"></i> No ballot matches this receipt code in this election.</p>
                    }
                }
            </div>
        </section>
    `,
    styles: [
        `
            :host { display: block; }
            .verify { background: var(--mj-bg-surface); border: 1px solid var(--mj-border-default); border-radius: 10px; padding: 1rem 1.25rem; }
            h3 { margin: 0 0 0.35rem; font-size: 1.05rem; color: var(--mj-text-primary); }
            h3 i { color: var(--mj-brand-primary); margin-right: 0.35rem; }
            .hint { margin: 0 0 0.75rem; color: var(--mj-text-secondary); font-size: 0.9rem; }
            .row { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
            .input { flex: 1; min-width: 14rem; padding: 0.45rem 0.65rem; border: 1px solid var(--mj-border-default); border-radius: 6px; background: var(--mj-bg-surface); color: var(--mj-text-primary); font-family: monospace; letter-spacing: 0.05em; text-transform: uppercase; }
            .input:focus-visible { outline: 2px solid var(--mj-border-focus); outline-offset: 1px; }
            .input[aria-invalid='true'] { border-color: var(--mj-status-error); }
            .status { margin: 0.75rem 0 0; padding: 0.6rem 0.8rem; border-radius: 8px; display: flex; gap: 0.5rem; align-items: center; }
            .status-ok { background: var(--mj-status-success-bg); color: var(--mj-status-success-text); }
            .status-warn { background: var(--mj-status-warning-bg); color: var(--mj-status-warning-text); }
            .status-error { background: var(--mj-status-error-bg); color: var(--mj-status-error-text); }
            .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
            @media print { :host { display: none; } }
        `,
    ],
})
export class ReceiptVerifyComponent {
    @Input({ required: true }) ElectionID!: string;

    public Code = '';
    public IsBusy = false;
    public CodeInvalid = false;
    public ErrorMessage: string | null = null;
    public Result: VotingVerifyReceiptOutput | null = null;

    public OnCodeChanged(): void {
        this.CodeInvalid = false;
        this.ErrorMessage = null;
        this.Result = null;
    }

    public async Verify(): Promise<void> {
        const code = this.Code.trim().toUpperCase();
        this.Result = null;
        this.ErrorMessage = null;
        if (!IsReceiptCode(code)) {
            this.CodeInvalid = true;
            return;
        }
        this.CodeInvalid = false;
        this.IsBusy = true;
        try {
            const res = await new VotingVerifyReceiptOperation().Execute({ ElectionID: this.ElectionID, ReceiptCode: code });
            const unwrapped = UnwrapOperation(res, 'The receipt could not be verified.');
            this.ErrorMessage = unwrapped.Error;
            this.Result = unwrapped.Output;
        } catch (error) {
            LogError('[VotingResults] Receipt verification failed', undefined, error);
            this.ErrorMessage = error instanceof Error ? error.message : 'The receipt could not be verified.';
        } finally {
            this.IsBusy = false;
        }
    }
}
