/**
 * Bundles the `<mj-ballot>` custom element into a single, self-contained, browser-loadable
 * file.
 *
 * Pipeline: ngc AOT-compiles the element to `dist/element/main.js` (templates + styles
 * inlined). This script then bundles that with the Angular runtime into one IIFE at
 * `dist-element/main.js`. Loading that file in a browser auto-registers `<mj-ballot>`.
 *
 * The published `@angular/*` packages ship as PARTIALLY-compiled libraries (`ɵɵngDeclare*`).
 * Bundling them directly leaves runtime "JIT compiler unavailable" errors. We therefore run
 * the linker (via `@angular/compiler-cli`'s babel plugin) over every module as an esbuild
 * `onLoad` step, converting partial declarations to full AOT.
 *
 * After bundling, a postcondition guard (`assertNoServerOnlyInputs`) reads esbuild's metafile
 * and fails the build if any server-only module made it in.
 */
import { build } from 'esbuild';
import { transformAsync } from '@babel/core';
import linkerPlugin from '@angular/compiler-cli/linker/babel';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { createPackageNameResolver, findServerOnlyInputs } from './ballot-bundle-guard.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');
const entryPoint = resolve(packageRoot, 'dist/element/main.js');
const outDir = resolve(packageRoot, 'dist-element');
const outFile = resolve(outDir, 'main.js');

if (!existsSync(entryPoint)) {
  console.error(
    `[build:element] Compiled entry not found at ${entryPoint}. ` +
      `Run "npm run build" (ngc) first — build:element bundles ngc output, it does not compile.`,
  );
  process.exit(1);
}

// Create output directory
mkdirSync(outDir, { recursive: true });

/**
 * esbuild plugin: run the Angular Linker over partially-compiled Angular packages so their
 * `ɵɵngDeclare*` declarations become full AOT. Scoped to `@angular` to keep the build fast.
 */
const angularLinker = {
  name: 'angular-linker',
  setup(buildApi) {
    buildApi.onLoad({ filter: /\/@angular\/.*\.m?js$/ }, async (args) => {
      const source = readFileSync(args.path, 'utf8');
      if (!source.includes('ngDeclare')) {
        return { contents: source, loader: 'js' };
      }
      const result = await transformAsync(source, {
        filename: args.path,
        configFile: false,
        babelrc: false,
        compact: false,
        sourceMaps: false,
        plugins: [linkerPlugin.default ?? linkerPlugin],
      });
      return { contents: result?.code ?? source, loader: 'js' };
    });
  },
};

const result = await build({
  entryPoints: [entryPoint],
  outfile: outFile,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  sourcemap: true,
  legalComments: 'none',
  define: { ngDevMode: 'false', ngJitMode: 'false' },
  plugins: [angularLinker],
  metafile: true,
  logLevel: 'info',
});

/** Fails the build when esbuild bundled any server-only module. */
function assertNoServerOnlyInputs(metafile) {
  const packageNameOf = createPackageNameResolver(process.cwd());
  const offendersByPackage = findServerOnlyInputs(Object.keys(metafile.inputs), packageNameOf);
  if (offendersByPackage.size === 0) return;

  console.error(
    '[build:element] The <mj-ballot> bundle contains server-only modules. The ballot ' +
      'widget runs on voters\' browsers, and these packages arrive through a barrel ' +
      "import — import from '@mj-biz-apps/voting-entities/contracts', not " +
      "'@mj-biz-apps/voting-entities'. Offending inputs by package:",
  );
  for (const [pkg, paths] of offendersByPackage) {
    console.error(`  ${pkg}: ${paths.length} file(s)`);
    for (const path of paths) console.error(`    ${path}`);
  }
  process.exit(1);
}

assertNoServerOnlyInputs(result.metafile);

const out = result.metafile.outputs['dist-element/main.js'];
const bytes = out ? out.bytes : 0;
console.log(`[build:element] Bundled <mj-ballot> → ${outFile} (${(bytes / 1024).toFixed(1)} kB)`);
