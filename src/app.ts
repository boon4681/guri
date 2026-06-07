import Module from 'node:module';
import { isAbsolute, join, resolve } from 'node:path';
import { safeRegister } from './loader/loader';
import { scanRoutes, type ScannedRoute } from './routes';
import type { GuriBodySchema, GuriConfig, GuriInputSchema, GuriPaths, Handle, Middleware, RouteInput, Services } from './types';
import { isGuriBodySchema, isGuriInputSchema } from './validation';

export interface BuildGuriAppOptions {
    cwd?: string;
    services?: Services;
}

export interface BuiltGuriApp<App> {
    app: App;
    routes: ScannedRoute[];
    paths: GuriPaths;
}

interface RouteModule {
    handle?: Handle;
    middleware?: Middleware | Middleware[];
    body?: unknown;
    query?: unknown;
    config?: {
        skipInherited?: boolean;
    };
}

function loadModule(file: string): unknown {
    const resolved = require.resolve(file);
    delete require.cache[resolved];
    return require(resolved);
}

function interopDefault(value: unknown): unknown {
    if (value && typeof value === 'object' && 'default' in value) {
        return (value as { default: unknown }).default;
    }
    return value;
}

function normalizeMiddleware(value: unknown, file: string): Middleware[] {
    const exported = interopDefault(value);
    if (exported === undefined) {
        return [];
    }
    if (typeof exported === 'function') {
        return [exported as Middleware];
    }
    if (Array.isArray(exported)) {
        for (const middleware of exported) {
            if (typeof middleware !== 'function') {
                throw new Error(`Middleware export in ${file} must contain only functions.`);
            }
        }
        return exported as Middleware[];
    }
    throw new Error(`Middleware export in ${file} must be a function or an array of functions.`);
}

function assertBodySchema(value: unknown, file: string): asserts value is GuriBodySchema {
    if (!isGuriBodySchema(value)) {
        throw new Error(
            `${file}: "body" must be wrapped with a validator, e.g. \`export const body = zod.body({ json: ... })\` from guri/validators/zod.`,
        );
    }
}

function assertQuerySchema(value: unknown, file: string): asserts value is GuriInputSchema {
    if (!isGuriInputSchema(value)) {
        throw new Error(
            `${file}: "query" must be wrapped with a validator, e.g. \`export const query = zod.query(...)\` from guri/validators/zod.`,
        );
    }
}

function routeInput(routeModule: RouteModule, file: string): RouteInput | undefined {
    const input: RouteInput = {};
    if (routeModule.body !== undefined) {
        assertBodySchema(routeModule.body, file);
        input.body = routeModule.body;
    }
    if (routeModule.query !== undefined) {
        assertQuerySchema(routeModule.query, file);
        input.query = routeModule.query;
    }
    return input.body || input.query ? input : undefined;
}

function aliasValues(value: string | string[]): string[] {
    return Array.isArray(value) ? value : [value];
}

function resolveAliasTarget(cwd: string, target: string, capture = ''): string {
    const replaced = target.includes('*') ? target.replaceAll('*', capture) : target;
    return isAbsolute(replaced) ? replaced : resolve(cwd, replaced);
}

function matchAlias(request: string, key: string): string | undefined {
    if (key.includes('*')) {
        const [prefix, suffix = ''] = key.split('*');
        if (request.startsWith(prefix) && request.endsWith(suffix)) {
            return request.slice(prefix.length, request.length - suffix.length);
        }
        return undefined;
    }

    if (request === key) {
        return '';
    }

    const prefix = `${key}/`;
    if (request.startsWith(prefix)) {
        return request.slice(prefix.length);
    }

    return undefined;
}

function resolveAliasRequest(
    request: string,
    alias: GuriConfig['alias'],
    cwd: string,
): string | undefined {
    for (const [key, value] of Object.entries(alias ?? {})) {
        const capture = matchAlias(request, key);
        if (capture === undefined) {
            continue;
        }

        const [target] = aliasValues(value);
        if (!target) {
            continue;
        }

        return resolveAliasTarget(cwd, target, capture);
    }

    return undefined;
}

export function registerAliasResolver(alias: GuriConfig['alias'], cwd: string): () => void {
    if (!alias || Object.keys(alias).length === 0) {
        return () => { };
    }

    const moduleWithResolver = Module as typeof Module & {
        _resolveFilename: (request: string, parent: unknown, isMain: boolean, options: unknown) => string;
    };
    const originalResolveFilename = moduleWithResolver._resolveFilename;

    moduleWithResolver._resolveFilename = function resolveWithGuriAlias(
        request,
        parent,
        isMain,
        options,
    ) {
        return originalResolveFilename.call(
            this,
            resolveAliasRequest(request, alias, cwd) ?? request,
            parent,
            isMain,
            options,
        );
    };

    return () => {
        moduleWithResolver._resolveFilename = originalResolveFilename;
    };
}

const GURI_ALIAS_PREFIX = '$guri/';
let guriOutDir: string | undefined;
let guriResolverInstalled = false;

/**
 * Install a process-lifetime resolver for the internal `$guri/*` alias
 */
export function ensureGuriAliasResolver(outDir: string): void {
    guriOutDir = outDir;
    if (guriResolverInstalled) {
        return;
    }
    guriResolverInstalled = true;

    const moduleWithResolver = Module as typeof Module & {
        _resolveFilename: (request: string, parent: unknown, isMain: boolean, options: unknown) => string;
    };
    const originalResolveFilename = moduleWithResolver._resolveFilename;

    moduleWithResolver._resolveFilename = function resolveWithGuriInternalAlias(
        request,
        parent,
        isMain,
        options,
    ) {
        const mapped =
            typeof request === 'string' && request.startsWith(GURI_ALIAS_PREFIX) && guriOutDir
                ? join(guriOutDir, request.slice(GURI_ALIAS_PREFIX.length))
                : request;
        return originalResolveFilename.call(this, mapped, parent, isMain, options);
    };
}

export function resolveGuriPaths(config: Pick<GuriConfig, 'outDir'>, cwd = process.cwd()): GuriPaths {
    return {
        cwd: resolve(cwd),
        routesDir: resolve(cwd, 'src/routes'),
        outDir: resolve(cwd, config.outDir ?? '.guri'),
    };
}

export async function buildGuriApp<App>(
    config: GuriConfig<App>,
    options: BuildGuriAppOptions = {},
): Promise<BuiltGuriApp<App>> {
    const paths = resolveGuriPaths(config, options.cwd);
    const routes = await scanRoutes(paths.routesDir);
    const app = config.adapter.createApp();
    // Install the persistent `$guri` resolver BEFORE esbuild-register: it patches
    // `_resolveFilename` too, and its unregister() restores whatever it captured
    ensureGuriAliasResolver(paths.outDir);
    const { unregister } = await safeRegister();
    const unregisterAliasResolver = registerAliasResolver(config.alias, paths.cwd);

    try {
        for (const route of routes) {
            const routeModule = loadModule(route.file) as RouteModule;
            if (typeof routeModule.handle !== 'function') {
                throw new Error(`${route.file} must export a named handle function.`);
            }

            const folderMiddleware = routeModule.config?.skipInherited
                ? []
                : route.sharedFiles.flatMap((file) =>
                    normalizeMiddleware((loadModule(file) as { middleware?: unknown }).middleware, file),
                );
            const verbMiddleware = normalizeMiddleware(routeModule.middleware, route.file);

            config.adapter.register(app, {
                method: route.method,
                path: route.path,
                handle: routeModule.handle,
                middleware: [...folderMiddleware, ...verbMiddleware],
                input: routeInput(routeModule, route.file),
                services: options.services,
            });
        }
    } finally {
        unregisterAliasResolver();
        unregister();
    }

    return { app, routes, paths };
}
