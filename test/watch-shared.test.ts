import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildGiriApp, defineConfig } from '../src';
import { hono } from '../src/adapters/hono';
import { createWatchUpdater, syncProject } from '../src/generator';

const tmp = join(process.cwd(), 'test', '.tmp', 'watch-shared');

async function roleFrom(config: ReturnType<typeof defineConfig>): Promise<unknown> {
    const built = await buildGiriApp(config, { cwd: tmp });
    const res = await config.adapter.fetch(built.app, new Request('http://giri.test/'));
    return (await res.json()).role;
}

describe('watch: +shared.ts change', () => {
    beforeEach(async () => {
        await rm(tmp, { recursive: true, force: true });
    });
    afterEach(async () => {
        await rm(tmp, { recursive: true, force: true });
    });

    it('rebuilds folder middleware when +shared.ts is edited (no hang, no stale)', async () => {
        const routesDir = join(tmp, 'src', 'routes');
        const outDir = join(tmp, '.giri');
        await mkdir(routesDir, { recursive: true });
        await writeFile(
            join(routesDir, '+shared.ts'),
            'export const middleware = async (c, next) => { c.set("role", "member"); await next(); };',
        );
        await writeFile(
            join(routesDir, '+get.ts'),
            'export const handle = (c) => c.json({ role: c.get("role") });',
        );

        const config = defineConfig({ adapter: hono(), outDir });

        // Mirror real serve: sync, then build (populates require.cache → the module graph).
        const initial = await syncProject(config, { cwd: tmp });
        const updater = createWatchUpdater(config, initial);
        expect(await roleFrom(config)).toBe('member');

        // Edit +shared.ts and feed the watch event the way the CLI does.
        await writeFile(
            join(routesDir, '+shared.ts'),
            'export const middleware = async (c, next) => { c.set("role", "admin"); await next(); };',
        );
        const outcome = await updater.apply('routes/+shared.ts');
        expect(outcome === 'incremental' || outcome === 'full').toBe(true);

        expect(await roleFrom(config)).toBe('admin');
    });
});
