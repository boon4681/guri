import { toJsonSchema } from '@valibot/to-json-schema';
import * as v from 'valibot';
import { defineBodySchema, defineInputSchema } from '../validation';
import type { BodyContentType, GuriBodySchema, GuriInputSchema } from '../types';

type AnySchema = v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>;

/** Wrap a single Valibot schema as a guri input schema. */
function wrap<Schema extends AnySchema>(schema: Schema): GuriInputSchema<v.InferOutput<Schema>> {
    return defineInputSchema<v.InferOutput<Schema>>({
        validate(value) {
            const result = v.safeParse(schema, value);
            return result.success
                ? { ok: true, value: result.output }
                : { ok: false, issues: result.issues };
        },
        toJsonSchema() {
            return toJsonSchema(schema) as Record<string, unknown>;
        },
    });
}

/**
 * Valibot adapter. Peer-depends `valibot` and `@valibot/to-json-schema`.
 *
 * ```ts
 * import * as v from 'valibot';
 * import { valibot } from 'guri/validators/valibot';
 *
 * export const body = valibot.body({ json: v.object({ name: v.pipe(v.string(), v.minLength(1)) }) });
 * export const query = valibot.query(v.object({ page: v.string() }));
 * ```
 */
export const valibot = {
    body<Map extends Partial<Record<BodyContentType, AnySchema>>>(
        map: Map,
    ): GuriBodySchema<{ [K in keyof Map]: Map[K] extends AnySchema ? v.InferOutput<Map[K]> : never }> {
        const contents = {} as Record<BodyContentType, GuriInputSchema>;
        for (const [contentType, schema] of Object.entries(map)) {
            if (schema) {
                contents[contentType as BodyContentType] = wrap(schema);
            }
        }
        return defineBodySchema(contents) as unknown as GuriBodySchema<{
            [K in keyof Map]: Map[K] extends AnySchema ? v.InferOutput<Map[K]> : never;
        }>;
    },
    query<Schema extends AnySchema>(schema: Schema): GuriInputSchema<v.InferOutput<Schema>> {
        return wrap(schema);
    },
};
