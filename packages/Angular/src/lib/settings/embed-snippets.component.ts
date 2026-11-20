/**
 * EmbedSnippetsComponent — copy-ready embed code for a ballot distribution: the custom element
 * (script tag + <mj-ballot>) and the iframe fallback, built from the API origin.
 */
import { Component, Input, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';

interface Snippet {
    Key: string;
    Title: string;
    Description: string;
    Code: string;
}

@Component({
    selector: 'voting-embed-snippets',
    standalone: true,
    imports: [CommonModule, MJButtonDirective],
    template: `
        <section class="snippets" aria-labelledby="embed-heading">
            <h3 id="embed-heading"><i class="fa-solid fa-code"></i> Embed this ballot</h3>
            <p class="hint">
                The ballot is served from <code>{{ VoteRoot }}</code>. Pages that embed it must be listed under allowed origins.
            </p>
            @for (s of Snippets; track s.Key) {
                <div class="snippet">
                    <div class="snippet-head">
                        <div>
                            <strong>{{ s.Title }}</strong>
                            <p class="hint">{{ s.Description }}</p>
                        </div>
                        <button type="button" mjButton variant="secondary" size="sm" (click)="Copy(s)" [attr.aria-label]="'Copy ' + s.Title + ' snippet'">
                            <i class="fa-solid" [class.fa-copy]="CopiedKey !== s.Key" [class.fa-check]="CopiedKey === s.Key"></i>
                            {{ CopiedKey === s.Key ? 'Copied' : 'Copy' }}
                        </button>
                    </div>
                    <pre class="code" tabindex="0"><code>{{ s.Code }}</code></pre>
                </div>
            }
            <div aria-live="polite" class="sr-only">{{ CopiedKey ? 'Snippet copied to clipboard' : '' }}</div>
            @if (CopyFailed) {
                <p class="error" role="alert">Copying is not available in this browser. Select the snippet text and copy it manually.</p>
            }
            <p class="hint">
                Public ballot page: <a [href]="PageUrl" target="_blank" rel="noopener noreferrer">{{ PageUrl }}</a>
            </p>
        </section>
    `,
    styles: [
        `
            :host { display: block; }
            .snippets { background: var(--mj-bg-surface); border: 1px solid var(--mj-border-default); border-radius: 10px; padding: 1rem 1.25rem; }
            h3 { margin: 0 0 0.35rem; color: var(--mj-text-primary); font-size: 1.05rem; }
            h3 i { color: var(--mj-brand-primary); margin-right: 0.35rem; }
            .hint { margin: 0.15rem 0 0.5rem; font-size: 0.85rem; color: var(--mj-text-secondary); }
            .snippet { margin-top: 0.75rem; }
            .snippet-head { display: flex; justify-content: space-between; gap: 0.75rem; align-items: flex-start; }
            .snippet-head .hint { margin-bottom: 0; }
            .code { margin: 0.35rem 0 0; padding: 0.65rem 0.8rem; background: var(--mj-bg-surface-sunken); border: 1px solid var(--mj-border-subtle); border-radius: 8px; overflow-x: auto; font-size: 0.8rem; color: var(--mj-text-primary); }
            .code:focus-visible { outline: 2px solid var(--mj-border-focus); outline-offset: 1px; }
            code { font-family: monospace; }
            .error { color: var(--mj-status-error-text); font-size: 0.85rem; }
            a { color: var(--mj-text-link); word-break: break-all; }
            .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
        `,
    ],
})
export class EmbedSnippetsComponent {
    private readonly cdr = inject(ChangeDetectorRef);
    @Input({ required: true }) Slug!: string;
    /** Origin of the MJ API that serves the ballot edge, e.g. https://api.example.org. */
    @Input({ required: true }) ApiOrigin!: string;

    public CopiedKey: string | null = null;
    public CopyFailed = false;

    public get VoteRoot(): string {
        return `${this.ApiOrigin}/vote`;
    }

    public get PageUrl(): string {
        return `${this.VoteRoot}/${encodeURIComponent(this.Slug)}`;
    }

    public get Snippets(): Snippet[] {
        const slug = this.Slug;
        return [
            {
                Key: 'element',
                Title: 'Custom element',
                Description: 'Add to any page that can run scripts. The ballot renders inside its own shadow DOM.',
                Code:
                    `<script type="module" src="${this.VoteRoot}/element/main.js"></script>\n` +
                    `<mj-ballot slug="${slug}" api-root="${this.VoteRoot}"></mj-ballot>`,
            },
            {
                Key: 'iframe',
                Title: 'Iframe',
                Description: 'For sites that cannot run scripts. The frame resizes itself through postMessage.',
                Code: `<iframe src="${this.PageUrl}" title="Ballot" style="width:100%;border:0;min-height:640px" allow="clipboard-write"></iframe>`,
            },
        ];
    }

    public async Copy(snippet: Snippet): Promise<void> {
        this.CopyFailed = false;
        try {
            await navigator.clipboard.writeText(snippet.Code);
            this.CopiedKey = snippet.Key;
            setTimeout(() => {
                if (this.CopiedKey === snippet.Key) {
                    this.CopiedKey = null;
                }
            }, 2500);
        } catch {
            this.CopyFailed = true;
        }
        this.cdr.detectChanges();
    }
}
