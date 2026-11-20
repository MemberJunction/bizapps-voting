/**
 * StatusChip — a presentational component for displaying election status.
 * Uses semantic tokens from MJ design system.
 */
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

type ElectionStatus = 'Draft' | 'Nominations' | 'Ready' | 'Open' | 'Closed' | 'Tallied' | 'Certified' | 'Cancelled';

interface StatusConfig {
    icon: string;
    label: string;
    className: string;
}

const STATUS_CONFIG: Record<ElectionStatus, StatusConfig> = {
    Draft: {
        icon: 'fa-solid fa-edit',
        label: 'Draft',
        className: 'status-draft',
    },
    Nominations: {
        icon: 'fa-solid fa-hand-fist',
        label: 'Nominations',
        className: 'status-nominations',
    },
    Ready: {
        icon: 'fa-solid fa-circle-check',
        label: 'Ready',
        className: 'status-ready',
    },
    Open: {
        icon: 'fa-solid fa-circle-check',
        label: 'Open',
        className: 'status-open',
    },
    Closed: {
        icon: 'fa-solid fa-lock',
        label: 'Closed',
        className: 'status-closed',
    },
    Tallied: {
        icon: 'fa-solid fa-calculator',
        label: 'Tallied',
        className: 'status-tallied',
    },
    Certified: {
        icon: 'fa-solid fa-certificate',
        label: 'Certified',
        className: 'status-certified',
    },
    Cancelled: {
        icon: 'fa-solid fa-ban',
        label: 'Cancelled',
        className: 'status-cancelled',
    },
};

@Component({
    selector: 'voting-status-chip',
    standalone: true,
    imports: [CommonModule],
    template: `
        @if (config) {
            <span [class]="'status-chip ' + config.className">
                <i [class]="config.icon"></i> {{ config.label }}
            </span>
        }
    `,
    styles: [
        `
            :host {
                display: inline-block;
            }
            .status-chip {
                display: inline-flex;
                align-items: center;
                gap: 0.35rem;
                padding: 0.25rem 0.65rem;
                border-radius: 12px;
                font-size: 0.8rem;
                font-weight: 600;
                white-space: nowrap;
            }
            .status-chip i {
                font-size: 0.75rem;
            }
            /* Status colors using semantic tokens */
            .status-draft {
                background: var(--mj-status-warning-bg);
                color: var(--mj-status-warning-text);
            }
            .status-nominations {
                background: var(--mj-status-info-bg);
                color: var(--mj-status-info-text);
            }
            .status-ready {
                background: var(--mj-status-info-bg);
                color: var(--mj-status-info-text);
            }
            .status-open {
                background: var(--mj-status-success-bg);
                color: var(--mj-status-success-text);
            }
            .status-closed {
                background: var(--mj-status-warning-bg);
                color: var(--mj-status-warning-text);
            }
            .status-tallied {
                background: var(--mj-status-info-bg);
                color: var(--mj-status-info-text);
            }
            .status-certified {
                background: var(--mj-status-success-bg);
                color: var(--mj-status-success-text);
            }
            .status-cancelled {
                background: var(--mj-status-error-bg);
                color: var(--mj-status-error-text);
            }
        `,
    ],
})
export class StatusChipComponent {
    @Input() Status?: ElectionStatus;

    get config(): StatusConfig | undefined {
        return this.Status ? STATUS_CONFIG[this.Status] : undefined;
    }
}
