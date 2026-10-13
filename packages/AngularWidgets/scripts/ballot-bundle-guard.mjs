/**
 * The ballot-element bundle postcondition: which of esbuild's bundled inputs must never reach
 * `<mj-ballot>`. Kept apart from `build-element.mjs` so the rule can be exercised without
 * running a build; the build script owns the reporting and exit code.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Inputs that must never reach the ballot bundle. The widget runs on anonymous voters'
 * devices, so every byte is download + parse time. These all arrive through package-level
 * imports, so the fix is to import from `@mj-biz-apps/voting-entities/contracts` instead.
 *
 * Rules match on the package that OWNS an input (see `createPackageNameResolver`), never on
 * the shape of its path.
 */
const SERVER_ONLY_INPUTS = [
  // Any MemberJunction package: MJCore, MJGlobal, … — the entity runtime, never needed
  // in a browser ballot widget.
  { label: '@memberjunction/*', matches: (name) => name?.startsWith('@memberjunction/') === true },
  // Arrives with MJCore (expression parsing); its presence alone means the barrel leaked.
  { label: 'acorn', matches: (name) => name === 'acorn' },
  // The voting-entities generated modules: the `entity_subclasses` barrel and the per-schema
  // `entities/<schema>` module. The contracts the widget DOES import live in the same package,
  // one directory over, so this rule needs the path.
  {
    label: 'voting-entities generated subclasses',
    matches: (name, inputPath) =>
      name === '@mj-biz-apps/voting-entities' && /\/generated\/(entity_subclasses|entities\/)/.test(inputPath),
  },
];

/**
 * The bundled inputs that break the rule, grouped as `"<package> [<rule label>]"` → input paths.
 * Empty when the bundle is clean.
 * @param {string[]} inputPaths keys of esbuild's `metafile.inputs`
 * @param {(inputPath: string) => string | undefined} packageNameOf see `createPackageNameResolver`
 * @returns {Map<string, string[]>}
 */
export function findServerOnlyInputs(inputPaths, packageNameOf) {
  const offendersByPackage = new Map();
  for (const inputPath of inputPaths) {
    const name = packageNameOf(inputPath);
    const hit = SERVER_ONLY_INPUTS.find((entry) => entry.matches(name, inputPath));
    if (!hit) continue;
    const key = `${name} [${hit.label}]`;
    offendersByPackage.set(key, [...(offendersByPackage.get(key) ?? []), inputPath]);
  }
  return offendersByPackage;
}

/**
 * Returns a function naming the npm package that owns an esbuild input path: the `name` of the
 * nearest `package.json` above it, skipping the nameless `{ "type": "module" }` stubs.
 * Lookups are cached per directory.
 * @param {string} absWorkingDir the directory esbuild's metafile paths are relative to
 * @returns {(inputPath: string) => string | undefined}
 */
export function createPackageNameResolver(absWorkingDir) {
  const nameByDir = new Map();
  const nameOwning = (dir) => {
    if (nameByDir.has(dir)) return nameByDir.get(dir);
    const manifest = join(dir, 'package.json');
    const own = existsSync(manifest) ? readManifestName(manifest) : undefined;
    const parent = dirname(dir);
    const name = own ?? (parent === dir ? undefined : nameOwning(parent));
    nameByDir.set(dir, name);
    return name;
  };
  return (inputPath) => nameOwning(dirname(resolve(absWorkingDir, inputPath)));
}

/** The `name` of one package.json; a manifest that will not parse fails naming its path. */
function readManifestName(manifestPath) {
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8')).name;
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    throw new Error(`[build:element] Cannot read the package name from ${manifestPath}: ${err.message}`);
  }
}
