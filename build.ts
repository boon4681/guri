import process from 'node:process';
import { build } from 'tsup';

async function main(): Promise<void> {
    await build({
        entry: [
            'src/index.ts',
            'src/cli.ts',
            'src/adapters/hono.ts',
            'src/validators/zod.ts',
            'src/validators/valibot.ts',
            'src/typescript-plugin.ts',
        ],
        format: ['cjs'],
        dts: true,
        sourcemap: true,
        clean: true,
        tsconfig: 'tsconfig.json',
    });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
