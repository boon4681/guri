import { cancel, log, spinner } from '@clack/prompts';
import { existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { exit } from 'node:process';
import { configSchema } from '../config/schema';
import { Value } from "@sinclair/typebox/value"
import { Static } from '@sinclair/typebox';

const assertES5 = async (unregister: () => void) => {
    try {
        require('./_es5.ts');
    } catch (e: any) {
        if ('errors' in e && Array.isArray(e.errors) && e.errors.length > 0) {
            const es5Error = (e.errors as any[]).filter((it) => it.text?.includes(`("es5") is not supported yet`)).length > 0;
            if (es5Error) {
                log.error(
                    `Please change compilerOptions.target from 'es5' to 'es6' or above in your tsconfig.json`
                );
                exit(1);
            }
        }
        log.error(e);
        exit(1);
    }
};

export const safeRegister = async () => {
    const { register } = await import('esbuild-register/dist/node');
    let res: { unregister: () => void };
    try {
        res = register({
            format: 'cjs',
            loader: 'ts',
        });
    } catch {
        // tsx fallback
        res = {
            unregister: () => { },
        };
    }

    // has to be outside try catch to be able to run with tsx
    await assertES5(res.unregister);
    return res;
}

export const findConfigPath = (cwd: string = resolve()): string | undefined => {
    for (const name of ['giri.config.ts', 'giri.config.js']) {
        const path = resolve(cwd, name);
        if (existsSync(path)) {
            return path;
        }
    }
    return undefined;
};

export const load = async (opts: { throwOnError?: boolean } = {}) => {
    const fail = (message: string): never => {
        if (opts.throwOnError) {
            throw new Error(message);
        }
        log.error(message);
        exit(1);
    };

    const path = findConfigPath();
    if (!path) {
        fail("Config file not found.")
    }

    const { unregister } = await safeRegister();
    let content: unknown;
    try {
        const required = require(`${path}`);
        content = required.default ?? required;
    } finally { }
    unregister();
    // get response and then check by each dialect independently
    const res = Value.Check(configSchema, content);
    if (!res) {
        const messages = [...Value.Errors(configSchema, content)].map((error) => error.message);
        if (!opts.throwOnError) {
            for (const message of messages) {
                log.error(message);
            }
        }
        fail(messages.join('\n'));
    }
    return content as Static<typeof configSchema>
}
