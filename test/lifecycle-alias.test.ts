import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { registerAliasResolver } from '../src/app';
import { loadLifecycle, runInit } from '../src/lifecycle';

const tmp = join(process.cwd(), 'test', '.tmp', 'lifecycle-alias');

describe('lifecycle alias resolution', () => {
    beforeEach(async () => {
        await rm(tmp, { recursive: true, force: true });
    });

    afterEach(async () => {
        await rm(tmp, { recursive: true, force: true });
    });

    // Regression: src/main.ts (and its imports) load via loadLifecycle/runInit, which is outside
    // buildGiriApp. The user alias resolver must be active there too, or `$db` fails to resolve.
    it('resolves a config alias used by src/main.ts during init', async () => {
        await mkdir(join(tmp, 'src'), { recursive: true });
        await writeFile(join(tmp, 'src', 'database.ts'), 'export const db = { name: "primary" };');
        await writeFile(
            join(tmp, 'src', 'main.ts'),
            [
                'import { db } from "$database";',
                'export const init = () => ({ db });',
            ].join('\n'),
        );

        const alias = { $database: './src/database.ts' };

        // Without the resolver, loading main.ts throws "Cannot find module '$database'".
        await expect(loadLifecycle(tmp)).rejects.toThrow(/\$database/);

        const unregister = registerAliasResolver(alias, tmp);
        try {
            const lifecycle = await loadLifecycle(tmp);
            const services = await runInit(lifecycle);
            expect(services).toEqual({ db: { name: 'primary' } });
        } finally {
            unregister();
        }
    });

    // Regression: a bare `$helper` must not swallow `$helper/foo` - the `$helper/*` glob owns
    // subpaths (TS `paths` semantics). Previously `$helper/foo` wrongly resolved to index.ts.
    it('routes a subpath to the `/*` glob, not the bare alias', async () => {
        await mkdir(join(tmp, 'src', 'helper'), { recursive: true });
        await writeFile(join(tmp, 'src', 'helper', 'index.ts'), 'export const name = "index";');
        await writeFile(join(tmp, 'src', 'helper', 'foo.ts'), 'export const name = "foo";');
        await writeFile(
            join(tmp, 'src', 'main.ts'),
            [
                'import { name as bare } from "$helper";',
                'import { name as sub } from "$helper/foo";',
                'export const init = () => ({ bare, sub });',
            ].join('\n'),
        );

        const alias = {
            $helper: './src/helper/index.ts',
            '$helper/*': './src/helper/*',
        };

        const unregister = registerAliasResolver(alias, tmp);
        try {
            const services = await runInit(await loadLifecycle(tmp));
            expect(services).toEqual({ bare: 'index', sub: 'foo' });
        } finally {
            unregister();
        }
    });

    // The glob must still win regardless of entry order (bare alias listed first).
    it('is order-independent between the bare alias and its `/*` glob', async () => {
        await mkdir(join(tmp, 'src', 'helper'), { recursive: true });
        await writeFile(join(tmp, 'src', 'helper', 'foo.ts'), 'export const name = "foo";');
        await writeFile(
            join(tmp, 'src', 'main.ts'),
            [
                'import { name } from "$helper/foo";',
                'export const init = () => ({ name });',
            ].join('\n'),
        );

        // Bare alias intentionally first; its prefix must not shadow the glob.
        const alias = {
            $helper: './src/helper/index.ts',
            '$helper/*': './src/helper/*',
        };

        const unregister = registerAliasResolver(alias, tmp);
        try {
            const services = await runInit(await loadLifecycle(tmp));
            expect(services).toEqual({ name: 'foo' });
        } finally {
            unregister();
        }
    });
});
