import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));
const packages = resolve(here, '..');

/**
 * Until `pnpm install` at the M5 root has linked this package's own dependencies, resolve the sibling workspace
 * packages straight to their built output. Once node_modules/@mj-biz-apps/voting-server exists the aliases switch off
 * and normal workspace resolution applies.
 */
const linked = existsSync(resolve(here, 'node_modules/@mj-biz-apps/voting-server'));
const aliases: Record<string, string> = linked
    ? {}
    : {
          '@mj-biz-apps/voting-server': resolve(packages, 'Server/dist/index.js'),
          '@mj-biz-apps/voting-entities': resolve(packages, 'Entities/dist/index.js'),
          '@mj-biz-apps/voting-engine-base': resolve(packages, 'EngineBase/dist/index.js'),
          '@mj-biz-apps/voting-core-entities-server': resolve(packages, 'CoreEntitiesServer/dist/index.js'),
          '@mj-biz-apps/common-entities': resolve(packages, '../../bizapps-common/packages/Entities/dist/index.js'),
          '@memberjunction/generic-database-provider': resolve(packages, '../../MJ/packages/GenericDatabaseProvider/dist/index.js'),
          '@memberjunction/global': resolve(packages, '../../MJ/packages/MJGlobal/dist/index.js'),
      };

export default defineConfig({
    resolve: { alias: aliases },
    test: {
        environment: 'node',
        setupFiles: ['./src/support/env-setup.ts'],
        include: ['src/__tests__/**/*.test.ts'],
        // Workspace packages must load natively (one module instance, one set of @RegisterClass registrations),
        // exactly as MJAPI loads them; never re-transformed by Vite.
        server: { deps: { external: [/\/(MJ|bizapps-voting|bizapps-common)\/packages\/[^/]+\/dist\//] } },
        // One shared real database and process-wide singletons: run files one after another.
        fileParallelism: false,
        testTimeout: 120_000,
        hookTimeout: 120_000,
    },
});
