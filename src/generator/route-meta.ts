import { registerAliasResolver } from '../app';
import { safeRegister } from '../loader/loader';
import type { ScannedRoute } from '../routes';
import type { GiriConfig, GiriPaths, Middleware, SecurityRequirement } from '../types';
import { bodyToJsonSchemas, inputToJsonSchema, type RouteInputSchemas } from './inputs';

export interface RouteSecurity {
    /** Operation-level `security` requirements, e.g. `[{ bearerAuth: [] }]`. */
    security: SecurityRequirement[];
    /** Scheme definitions to merge into `components.securitySchemes`. */
    securitySchemes: Record<string, unknown>;
}

/** Resolved OpenAPI operation metadata (everything on `openapi` except `hidden`). */
export interface RouteOpenApiMeta {
    tags?: string[];
    summary?: string;
    description?: string;
    deprecated?: boolean;
    operationId?: string;
}

export interface RouteMeta {
    input?: RouteInputSchemas;
    security?: RouteSecurity;
    /** Excluded from `openapi.json` (via `openapi`/`+shared.ts` resolution). */
    hidden?: boolean;
    /** Operation metadata (tags/summary/…) resolved down the `+shared.ts` chain. */
    openapi?: RouteOpenApiMeta;
}

function loadModule(file: string): Record<string, unknown> {
    const resolved = require.resolve(file);
    delete require.cache[resolved];
    return require(resolved) as Record<string, unknown>;
}

function interopDefault(value: unknown): unknown {
    if (value && typeof value === 'object' && 'default' in value) {
        return (value as { default: unknown }).default;
    }
    return value;
}

function middlewareFunctions(value: unknown): Middleware[] {
    const exported = interopDefault(value);
    if (typeof exported === 'function') {
        return [exported as Middleware];
    }
    if (Array.isArray(exported)) {
        return exported.filter((fn): fn is Middleware => typeof fn === 'function');
    }
    return [];
}

function readInput(routeModule: Record<string, unknown>): RouteInputSchemas | undefined {
    const input: RouteInputSchemas = {};
    const body = bodyToJsonSchemas(routeModule.body);
    const query = inputToJsonSchema(routeModule.query);
    if (body) {
        input.body = body;
    }
    if (query) {
        input.query = query;
    }
    return input.body || input.query ? input : undefined;
}

/**
 * Resolve the `openapi` export down a route's `+shared.ts` chain. `tags` are
 * merged and de-duplicated so a folder groups its routes; scalar fields (summary/description/
 * deprecated) override (verb wins); `operationId` is taken only from the verb file.
 */
function resolveOpenApi(
    route: ScannedRoute,
    routeModule: Record<string, unknown>,
    loadShared: (file: string) => Record<string, unknown>,
): { hidden: boolean; meta: RouteOpenApiMeta } {
    let hidden = false;
    const tags: string[] = [];
    const meta: RouteOpenApiMeta = {};

    const apply = (value: unknown, isVerb: boolean): void => {
        if (value === false) {
            hidden = true;
            return;
        }
        if (value === true) {
            hidden = false;
            return;
        }
        if (!value || typeof value !== 'object') {
            return;
        }
        const o = value as Record<string, unknown>;
        if ('hidden' in o) {
            hidden = Boolean(o.hidden);
        }
        if (Array.isArray(o.tags)) {
            tags.push(...o.tags.filter((tag): tag is string => typeof tag === 'string'));
        }
        if (typeof o.summary === 'string') {
            meta.summary = o.summary;
        }
        if (typeof o.description === 'string') {
            meta.description = o.description;
        }
        if (typeof o.deprecated === 'boolean') {
            meta.deprecated = o.deprecated;
        }
        if (isVerb && typeof o.operationId === 'string') {
            meta.operationId = o.operationId;
        }
    };

    for (const file of route.sharedFiles) {
        apply(loadShared(file).openapi, false);
    }
    apply(routeModule.openapi, true);

    if (tags.length > 0) {
        meta.tags = [...new Set(tags)];
    }
    return { hidden, meta };
}

function collectSecurity(
    route: ScannedRoute,
    routeModule: Record<string, unknown>,
    loadShared: (file: string) => Record<string, unknown>,
): RouteSecurity | undefined {
    const skipInherited = Boolean(
        (routeModule.config as { skipInherited?: boolean } | undefined)?.skipInherited,
    );

    const middleware: Middleware[] = [];
    if (!skipInherited) {
        for (const file of route.sharedFiles) {
            middleware.push(...middlewareFunctions(loadShared(file).middleware));
        }
    }
    middleware.push(...middlewareFunctions(routeModule.middleware));

    const security: SecurityRequirement[] = [];
    const securitySchemes: Record<string, unknown> = {};
    for (const fn of middleware) {
        const openapi = fn.openapi;
        if (openapi?.security) {
            for (const requirement of openapi.security) {
                if (!security.some((seen) => JSON.stringify(seen) === JSON.stringify(requirement))) {
                    security.push(requirement);
                }
            }
        }
        if (openapi?.securitySchemes) {
            Object.assign(securitySchemes, openapi.securitySchemes);
        }
    }

    return security.length > 0 || Object.keys(securitySchemes).length > 0
        ? { security, securitySchemes }
        : undefined;
}

/**
 * Load each route module once (with import aliases active) to derive runtime metadata:
 * input JSON Schemas from `body`/`query`, and OpenAPI `security` from the middleware
 * actually applied to the route (folder chain + verb, honoring `skipInherited`).
 */
export async function extractRouteMeta(
    config: Pick<GiriConfig, 'alias'>,
    paths: GiriPaths,
    routes: ScannedRoute[],
): Promise<Map<string, RouteMeta>> {
    const byFile = new Map<string, RouteMeta>();
    const { unregister } = await safeRegister();
    const unregisterAlias = registerAliasResolver(config.alias, paths.cwd);
    const sharedCache = new Map<string, Record<string, unknown>>();
    const loadShared = (file: string): Record<string, unknown> => {
        if (!sharedCache.has(file)) {
            try {
                sharedCache.set(file, loadModule(file));
            } catch {
                sharedCache.set(file, {});
            }
        }
        return sharedCache.get(file)!;
    };

    try {
        for (const route of routes) {
            try {
                const routeModule = loadModule(route.file);
                const meta: RouteMeta = {};
                const input = readInput(routeModule);
                const security = collectSecurity(route, routeModule, loadShared);
                const { hidden, meta: openapi } = resolveOpenApi(route, routeModule, loadShared);
                if (input) {
                    meta.input = input;
                }
                if (security) {
                    meta.security = security;
                }
                if (hidden) {
                    meta.hidden = true;
                }
                if (Object.keys(openapi).length > 0) {
                    meta.openapi = openapi;
                }
                if (meta.input || meta.security || meta.hidden || meta.openapi) {
                    byFile.set(route.file, meta);
                }
            } catch {
                // A route that fails to load just contributes no metadata.
            }
        }
    } finally {
        unregisterAlias();
        unregister();
    }

    return byFile;
}
