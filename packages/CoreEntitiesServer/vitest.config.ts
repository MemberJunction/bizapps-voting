import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            '@mj-biz-apps/voting-entities': fileURLToPath(new URL('../Entities/src/index.ts', import.meta.url)),
        },
    },
    test: {
        environment: 'node',
        include: ['src/**/__tests__/**/*.test.ts'],
    },
});
