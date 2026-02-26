import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/e2e/src/**/*.e2e.test.ts'],
        testTimeout: 120_000,
        hookTimeout: 120_000,
    },
    resolve: {
        alias: {
            '@core-ai/core-ai': resolve(
                process.cwd(),
                'packages/core-ai/src/index.ts'
            ),
        },
    },
});
