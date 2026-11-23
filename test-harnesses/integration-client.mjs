/**
 * Over-the-wire (GraphQL) dispatcher for BizApps Voting. Loads only the client-safe bundle (no *Server subclasses).
 *
 *   node test-harnesses/host.mjs start                       # voting test host on :4104 (once)
 *   pnpm --filter @mj-biz-apps/voting-integration-tests run provision:personas   # personas + API keys (once)
 *   node test-harnesses/integration-client.mjs               # every bundle
 *   node test-harnesses/integration-client.mjs wire-smoke    # one bundle
 *   node test-harnesses/integration-client.mjs wire-smoke.S3 # one check
 *
 * Needs: the built IntegrationTests package (`pnpm run build` there), the running host, the repo .env (MJ_API_KEY).
 * Exit code is 0 only when every selected check passed.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
const testsPackage = path.resolve(here, '../packages/IntegrationTests');
dotenv.config({ path: path.resolve(here, '..', '.env'), quiet: true });

const ALL_BUNDLES = ['wire-smoke', 'wire-world', 'wire-lifecycle', 'wire-tally', 'wire-trustee', 'wire-access', 'wire-secrecy', 'wire-edge', 'wire-volume'];
const requested = process.argv.slice(2).filter((a) => !a.startsWith('-'));

// Resolve everything relative to the tests package so the registry the checks register on is the one this script reads.
const requireFromTests = createRequire(path.join(testsPackage, 'package.json'));
const importResolved = (specifier) => import(pathToFileURL(requireFromTests.resolve(specifier)).href);

const { IntegrationCheckRegistry } = await importResolved('@memberjunction/testing-integration/registry');
await import(pathToFileURL(path.join(testsPackage, 'dist/client-index.js')).href);

const registry = IntegrationCheckRegistry.Instance;
const selection = requested.length ? requested : ALL_BUNDLES;
// Bundle checks do not use the framework context's provider (each wire identity owns its provider); the context exists to
// satisfy the lifecycle signature.
const ctx = { User: undefined, Provider: undefined, Schema: process.env.MJ_CORE_SCHEMA || '__mj', Storage: undefined };

let pass = 0;
let fail = 0;
const url = process.env.VOTING_WIRE_URL ?? `http://localhost:${process.env.VOTING_WIRE_PORT ?? 4104}/`;
console.log(`\n  Voting integration CLIENT (GraphQL -> ${url})\n`);

for (const request of selection) {
    const [bundle] = request.split('.');
    const checks = registry.GetBundle(bundle).filter((c) => request === bundle || c.Id === request);
    if (!checks.length) {
        console.error(`  FAIL unknown bundle or check: ${request}`);
        fail += 1;
        continue;
    }
    const lifecycle = registry.GetLifecycle(bundle);
    let ready = true;
    try {
        if (lifecycle) await lifecycle.Setup(ctx);
    } catch (err) {
        ready = false;
        console.error(`  FAIL ${bundle}.<setup>  ${err instanceof Error ? err.message : err}`);
        fail += 1;
    }
    if (ready) {
        for (const check of checks) {
            const started = Date.now();
            try {
                await check.Fn(ctx);
                console.log(`  ok   ${check.Id.padEnd(16)} ${String(Date.now() - started).padStart(5)}ms  ${check.Name}`);
                pass += 1;
            } catch (err) {
                console.error(`  FAIL ${check.Id.padEnd(16)} ${String(Date.now() - started).padStart(5)}ms  ${check.Name}\n         ${err instanceof Error ? err.message : err}`);
                fail += 1;
            }
        }
    }
    if (lifecycle) {
        await lifecycle.Teardown(ctx).catch((e) => console.warn(`  teardown warn: ${e instanceof Error ? e.message : e}`));
    }
}

console.log(`\n  ${pass} passed / ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
