import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        include: ['test/**/*.test.ts'],
        // Several tests spin up real TypeScript programs (schema extraction, sync, watch) which
        // take a few seconds each and contend for CPU when run in parallel - well past Vitest's
        // 5s default. Give them headroom so the suite isn't flaky on slower/busy machines.
        testTimeout: 30000,
    },
});
