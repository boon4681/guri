import { join } from 'node:path';
import { resolveGuriTypesImport } from '../src/typescript-plugin-core';

describe('typescript plugin resolution', () => {
    it('maps route-local ./$types imports to generated .guri types', () => {
        const projectDir = join(process.cwd(), 'test', '.tmp', 'plugin');
        const generated = join(
            projectDir,
            '.guri',
            'types',
            'routes',
            'users',
            '[id]',
            'posts',
            '[postId]',
            '$types.d.ts',
        );

        const resolved = resolveGuriTypesImport({
            moduleName: './$types',
            projectDir,
            containingFile: join(
                projectDir,
                'src',
                'routes',
                'users',
                '[id]',
                'posts',
                '[postId]',
                '+get.ts',
            ),
            fileExists: (path) => path === generated,
        });

        expect(resolved).toBe(generated);
    });

    it('ignores non-$types imports', () => {
        const resolved = resolveGuriTypesImport({
            moduleName: './db',
            projectDir: process.cwd(),
            containingFile: join(process.cwd(), 'src', 'routes', '+get.ts'),
            fileExists: () => true,
        });

        expect(resolved).toBeUndefined();
    });
});
