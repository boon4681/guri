import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { scanRoutes } from '../src';

const tmp = join(process.cwd(), 'test', '.tmp', 'routes');

describe('scanRoutes', () => {
    beforeEach(async () => {
        await rm(tmp, { recursive: true, force: true });
    });

    afterEach(async () => {
        await rm(tmp, { recursive: true, force: true });
    });

    it('discovers verb files, params, catch-all folders, and +shared order', async () => {
        const routesDir = join(tmp, 'src', 'routes');
        await mkdir(join(routesDir, 'users', '[id]', 'posts', '[postId]'), { recursive: true });
        await mkdir(join(routesDir, 'files', '[...path]'), { recursive: true });
        await writeFile(join(routesDir, '+shared.ts'), 'export const middleware = [];');
        await writeFile(join(routesDir, 'users', '[id]', '+shared.ts'), 'export const middleware = [];');
        await writeFile(join(routesDir, 'users', '[id]', '+get.ts'), 'export const handle = () => new Response();');
        await writeFile(join(routesDir, 'users', '[id]', 'posts', '[postId]', '+patch.ts'), 'export const handle = () => new Response();');
        await writeFile(join(routesDir, 'files', '[...path]', '+get.ts'), 'export const handle = () => new Response();');
        await writeFile(join(routesDir, 'users', '[id]', 'queries.ts'), 'export const helper = true;');

        const routes = await scanRoutes(routesDir);

        expect(routes.map((route) => `${route.method} ${route.path}`)).toEqual([
            'GET /files/:path{.*}',
            'GET /users/:id',
            'PATCH /users/:id/posts/:postId',
        ]);
        expect(routes[1].params).toEqual([{ name: 'id', catchAll: false }]);
        expect(routes[1].sharedFiles.map((file) => file.replace(/\\/g, '/'))).toEqual([
            expect.stringContaining('/src/routes/+shared.ts'),
            expect.stringContaining('/src/routes/users/[id]/+shared.ts'),
        ]);
    });
});
