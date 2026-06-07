import type { GuriConfig } from './types';

export {
    composeMiddleware,
    createContext,
    createTypedResponse,
    defineMiddleware,
    isTypedResponse,
    stack,
    toResponse,
    typedResponseToResponse,
} from './context';
export {
    defineBodySchema,
    defineInputSchema,
    isGuriBodySchema,
    isGuriInputSchema,
    prepareRequestInput,
} from './validation';
export { buildGuriApp, resolveGuriPaths } from './app';
export { scanRoutes } from './routes';
export { syncProject } from './generator';
export { loadLifecycle, runInit } from './lifecycle';
export type { GuriLifecycle } from './lifecycle';
export type {
    BodyContentType,
    Context,
    GuriAdapter,
    GuriBodySchema,
    GuriConfig,
    GuriFetchHandler,
    GuriInputSchema,
    GuriPaths,
    GuriRequest,
    GuriRouteRegistration,
    GuriServeOptions,
    GuriServer,
    GuriServerInfo,
    Handle,
    HandlerResponse,
    HttpMethod,
    Infer,
    InferStackVars,
    InputValidationResult,
    JsonSchema,
    MergeStack,
    Middleware,
    MiddlewareVarsOf,
    MiddlewareOpenApi,
    MiddlewareOptions,
    Next,
    RouteInput,
    RouteInputOf,
    RouteOpenApi,
    RouteOpenApiConfig,
    SecurityRequirement,
    Services,
    StatusCode,
    TypedResponse,
    ValidatedInput,
    ValidBody,
    ValidQuery,
    VarsOf,
} from './types';

export function defineConfig<App>(config: GuriConfig<App>): GuriConfig<App> {
    return config;
}
