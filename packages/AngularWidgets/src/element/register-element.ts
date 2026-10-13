/**
 * Registers `<mj-ballot>` as a browser custom element for embedding on any page.
 *
 * Usage:
 * ```html
 * <script src="/vote/element/main.js"></script>
 * <mj-ballot slug="election-2024" api-root="https://api.example.com/vote"></mj-ballot>
 * ```
 *
 * Attributes:
 * - `slug` (required): the election distribution slug
 * - `api-root` (optional): API root path, defaults to `${location.origin}/vote`
 * - `graphql-url` (optional): GraphQL endpoint; when absent the edge's info endpoint (GraphQLUrl) is used, then `${location.origin}/` (MJ's default GraphQL root), never `${api-root}/graphql`
 * - `host-assertion` (optional): RS256 host identity assertion
 * - `email` (optional): pre-filled voter email
 * - `language` (optional): ballot language (defaults to 'en')
 *
 * Events:
 * - `ballot-state-change`: {state: BallotState}
 * - `ballot-cast`: {electionId: string, receiptCode: string}
 * - `ballot-error`: {message: string}
 * - `ballot-close`: {}
 *
 * Each element instance hosts its own Angular application with the ballot component.
 */

import { ApplicationRef, ComponentRef, createComponent } from '@angular/core';
import { createApplication } from '@angular/platform-browser';

import { ELEMENT_ATTRIBUTES, configFromAttributes, effectOf, inputsFromAttributes } from './element-attributes';
import { keepInPlace } from './element-host';
import { ballotWidgetProviders } from './widget-providers';
import { MjBallotComponent } from './mj-ballot.component';

/** Element tag the widget registers under. */
export const MJ_BALLOT_TAG = 'mj-ballot';

/**
 * Define the `<mj-ballot>` custom element. Idempotent: a second call is a no-op
 * if the tag is already registered.
 */
export function registerMjBallotElement(): void {
  if (typeof customElements === 'undefined' || customElements.get(MJ_BALLOT_TAG)) {
    return;
  }
  customElements.define(MJ_BALLOT_TAG, MjBallotElement);
}

/**
 * The custom-element class. Each instance hosts its own Angular application
 * + MjBallotComponent, wired to the specified API and session config.
 */
class MjBallotElement extends HTMLElement {
  static get observedAttributes(): readonly string[] {
    return ELEMENT_ATTRIBUTES;
  }

  private appRef?: ApplicationRef;
  private componentRef?: ComponentRef<MjBallotComponent>;
  /** Serialises mounts so a burst of attribute changes cannot build two applications. */
  private mounting?: Promise<void>;
  /**
   * True while a rebuild tears the old application down. That teardown detaches
   * this element from the page and keepInPlace() puts it back.
   */
  private rebuilding = false;

  public connectedCallback(): void {
    if (this.rebuilding) {
      return;
    }
    void this.mount();
  }

  public attributeChangedCallback(name: string, previous: string | null, value: string | null): void {
    if (previous === value) {
      return;
    }
    switch (effectOf(name)) {
      case 'input':
        this.componentRef?.setInput(name, value ?? '');
        break;
      case 'rebuild':
        // Only rebuild if something is already running
        if (this.appRef) {
          void this.mount();
        }
        break;
      default:
        break;
    }
  }

  public disconnectedCallback(): void {
    if (this.rebuilding) {
      return;
    }
    this.teardown();
  }

  /**
   * Build (or rebuild) the Angular application for this element.
   *
   * Serialised through `mounting`. Attributes are read AFTER the await,
   * so a host that appends the element and sets attributes in the same tick
   * has them available.
   */
  private async mount(): Promise<void> {
    const run = this.mounting ?? Promise.resolve();
    this.mounting = run.then(async () => {
      if (!this.isConnected) {
        return;
      }
      this.teardownInPlace();
      const app = await createApplication({
        providers: ballotWidgetProviders(configFromAttributes((n) => this.getAttribute(n))),
      });
      if (!this.isConnected) {
        // Removed while we were building; do not attach an orphan view.
        app.destroy();
        return;
      }
      const componentRef = createComponent(MjBallotComponent, {
        environmentInjector: app.injector,
        hostElement: this,
      });
      for (const [name, value] of inputsFromAttributes((n) => this.getAttribute(n))) {
        componentRef.setInput(name, value);
      }
      app.attachView(componentRef.hostView);
      this.appRef = app;
      this.componentRef = componentRef;
    });
    await this.mounting;
  }

  /**
   * Tear the running application down for a rebuild, keeping this element in the page.
   *
   * Destroying a component hosted on this element detaches it, so we use keepInPlace()
   * to put it back.
   */
  private teardownInPlace(): void {
    this.rebuilding = true;
    try {
      keepInPlace(this, () => this.teardown());
    } finally {
      this.rebuilding = false;
    }
  }

  private teardown(): void {
    this.componentRef?.destroy();
    this.appRef?.destroy();
    this.componentRef = undefined;
    this.appRef = undefined;
  }
}
