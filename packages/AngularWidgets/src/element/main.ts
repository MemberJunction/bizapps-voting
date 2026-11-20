/**
 * Entry point for the `<mj-ballot>` custom element bundle.
 *
 * This file is compiled by ngc, then bundled by esbuild with the Angular Linker
 * to produce a single, self-contained, browser-loadable bundle. Loading the bundle
 * in a browser self-registers `<mj-ballot>`.
 *
 * ngc output: `dist/element-entry.js`
 * esbuild output: `dist-element/main.js`
 */

import { registerMjBallotElement } from './register-element';

// Auto-register the element when this module loads.
registerMjBallotElement();
