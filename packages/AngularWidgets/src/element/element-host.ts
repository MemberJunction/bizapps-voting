/**
 * Helpers for managing the custom element as a host for the Angular component.
 *
 * When an Angular component is created with `hostElement: this`, destroying the component
 * detaches it from the DOM. `keepInPlace` preserves the element's place in the page while
 * the old app is torn down, so a rebuild doesn't look like a removal.
 */

/**
 * Run a teardown function while keeping the element in the DOM.
 *
 * Destroys an Angular component and application, but the `hostElement: this` contract
 * means the teardown detaches the element. This function puts it back.
 */
export function keepInPlace(element: HTMLElement, teardown: () => void): void {
  const parent = element.parentElement;
  const nextSibling = element.nextSibling;

  teardown();

  if (parent) {
    if (nextSibling) {
      parent.insertBefore(element, nextSibling);
    } else {
      parent.appendChild(element);
    }
  }
}
