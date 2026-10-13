/**
 * ContributionHostComponent — renders a dynamically resolved admin tab or setup step.
 * Tabs and steps come from the UI driver and from contributing apps (see election-parts.ts);
 * this host instantiates the resolved component class, feeds it its inputs, and relays the
 * `Changed` / `Valid` outputs that the contribution base classes define.
 */
import {
    Component,
    ComponentRef,
    EventEmitter,
    Input,
    OnChanges,
    OnDestroy,
    OnInit,
    Output,
    SimpleChanges,
    Type,
    ViewChild,
    ViewContainerRef,
} from '@angular/core';

/** What the host needs from a hosted component: nothing is required; both outputs are optional. */
export interface HostedContribution {
    Changed?: EventEmitter<void>;
    Valid?: EventEmitter<boolean>;
}

@Component({
    selector: 'voting-contribution-host',
    standalone: true,
    template: `<ng-container #outlet></ng-container>`,
    styles: [`:host { display: block; }`],
})
export class ContributionHostComponent implements OnInit, OnChanges, OnDestroy {
    @Input() ComponentType: Type<HostedContribution> | null = null;
    @Input() Inputs: Record<string, unknown> = {};
    @Output() Changed = new EventEmitter<void>();
    @Output() Valid = new EventEmitter<boolean>();

    @ViewChild('outlet', { read: ViewContainerRef, static: true }) private outlet!: ViewContainerRef;

    private ref: ComponentRef<HostedContribution> | null = null;
    private renderedType: Type<HostedContribution> | null = null;
    private subscriptions: Array<{ unsubscribe(): void }> = [];

    ngOnInit(): void {
        this.Render();
    }

    ngOnChanges(_changes: SimpleChanges): void {
        if (this.outlet) {
            this.Render();
        }
    }

    ngOnDestroy(): void {
        this.Teardown();
    }

    private Render(): void {
        if (this.ComponentType !== this.renderedType) {
            this.Teardown();
            if (this.ComponentType) {
                this.ref = this.outlet.createComponent(this.ComponentType);
                this.renderedType = this.ComponentType;
                const instance = this.ref.instance;
                if (instance.Changed instanceof EventEmitter) {
                    this.subscriptions.push(instance.Changed.subscribe(() => this.Changed.emit()));
                }
                if (instance.Valid instanceof EventEmitter) {
                    this.subscriptions.push(instance.Valid.subscribe((v: boolean) => this.Valid.emit(v)));
                }
            }
        }
        if (this.ref) {
            for (const [name, value] of Object.entries(this.Inputs)) {
                this.ref.setInput(name, value);
            }
            this.ref.changeDetectorRef.markForCheck();
        }
    }

    private Teardown(): void {
        this.subscriptions.forEach((s) => s.unsubscribe());
        this.subscriptions = [];
        this.ref?.destroy();
        this.ref = null;
        this.renderedType = null;
        this.outlet?.clear();
    }
}
