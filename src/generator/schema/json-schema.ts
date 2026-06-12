import ts from 'typescript';

export type JSONSchema = Record<string, unknown>;

export interface WalkContext {
    checker: ts.TypeChecker;
    /** Node used to resolve property types in context. */
    location: ts.Node;
    /** Shared `$defs` bucket for recursive types. */
    defs: Record<string, JSONSchema>;
    /** Type ids currently being walked, mapped to their `$defs` name (cycle guard). */
    inProgress: Map<number, string>;
    /** `$defs` names that were referenced via `$ref` (i.e. proved recursive). */
    usedDefs: Set<string>;
    /** Non-fatal notes (e.g. bigint serialization caveats). */
    warnings: string[];
}

export function createWalkContext(checker: ts.TypeChecker, location: ts.Node): WalkContext {
    return {
        checker,
        location,
        defs: {},
        inProgress: new Map(),
        usedDefs: new Set(),
        warnings: [],
    };
}

function typeId(type: ts.Type): number {
    return (type as ts.Type & { id: number }).id;
}

function intrinsicName(type: ts.Type): string | undefined {
    return (type as ts.Type & { intrinsicName?: string }).intrinsicName;
}

function isDateType(type: ts.Type): boolean {
    const symbol = type.getSymbol() ?? type.aliasSymbol;
    return symbol?.getName() === 'Date';
}

function literalValuesOf(types: ts.Type[]): unknown[] | undefined {
    const values: unknown[] = [];
    for (const member of types) {
        if (member.isStringLiteral() || member.isNumberLiteral()) {
            values.push(member.value);
        } else if (member.flags & ts.TypeFlags.BooleanLiteral) {
            values.push(intrinsicName(member) === 'true');
        } else {
            return undefined;
        }
    }
    return values;
}

function walkUnion(type: ts.UnionType, ctx: WalkContext): JSONSchema {
    const flag = (ts.TypeFlags.Undefined | ts.TypeFlags.Void | ts.TypeFlags.Never);
    const members = type.types.filter((member) => !(member.flags & flag));

    if (members.length === 1) {
        return walkType(members[0], ctx);
    }

    const enumValues = literalValuesOf(members);
    if (enumValues) {
        return { enum: enumValues };
    }

    return { anyOf: members.map((member) => walkType(member, ctx)) };
}

function buildObjectSchema(type: ts.Type, ctx: WalkContext): JSONSchema {
    const { checker } = ctx;

    const indexInfo =
        checker.getIndexInfoOfType(type, ts.IndexKind.String) ??
        checker.getIndexInfoOfType(type, ts.IndexKind.Number);

    const properties: Record<string, JSONSchema> = {};
    const required: string[] = [];

    for (const symbol of checker.getPropertiesOfType(type)) {
        const name = symbol.getName();
        const propType = checker.getTypeOfSymbolAtLocation(symbol, ctx.location);
        const optional =
            Boolean(symbol.getFlags() & ts.SymbolFlags.Optional) ||
            Boolean(propType.flags & ts.TypeFlags.Union &&
                (propType as ts.UnionType).types.some((t) => t.flags & ts.TypeFlags.Undefined));

        properties[name] = walkType(propType, ctx);
        if (!optional) {
            required.push(name);
        }
    }

    const schema: JSONSchema = { type: 'object' };
    if (Object.keys(properties).length > 0) {
        schema.properties = properties;
    }
    if (required.length > 0) {
        schema.required = required;
    }
    if (indexInfo) {
        schema.additionalProperties = walkType(indexInfo.type, ctx);
    } else if (Object.keys(properties).length > 0) {
        schema.additionalProperties = false;
    }
    return schema;
}

/** `JSON.stringify` serializes via `toJSON()` when present, so its return type is the wire shape. */
function toJsonReturnType(type: ts.Type, ctx: WalkContext): ts.Type | undefined {
    const symbol = ctx.checker.getPropertyOfType(type, 'toJSON');
    if (!symbol) {
        return undefined;
    }
    const methodType = ctx.checker.getTypeOfSymbolAtLocation(symbol, ctx.location);
    const [signature] = methodType.getCallSignatures();
    return signature ? ctx.checker.getReturnTypeOfSignature(signature) : undefined;
}

function defName(type: ts.Type): string {
    const symbol = type.getSymbol() ?? type.aliasSymbol;
    const name = symbol?.getName();
    if (name && name !== '__type' && name !== '__object') {
        return name;
    }
    return `Anonymous${typeId(type)}`;
}

function walkObject(type: ts.Type, ctx: WalkContext): JSONSchema {
    const { checker } = ctx;

    if (isDateType(type)) {
        return { type: 'string', format: 'date-time' };
    }
    if (!checker.isArrayType(type) && !checker.isTupleType(type)) {
        const jsonReturn = toJsonReturnType(type, ctx);
        if (jsonReturn) {
            return walkType(jsonReturn, ctx);
        }
    }
    if (checker.isArrayType(type)) {
        const [element] = checker.getTypeArguments(type as ts.TypeReference);
        return { type: 'array', items: element ? walkType(element, ctx) : {} };
    }
    if (checker.isTupleType(type)) {
        const elements = checker.getTypeArguments(type as ts.TypeReference);
        return { type: 'array', items: elements.map((element) => walkType(element, ctx)) };
    }

    const id = typeId(type);
    const existing = ctx.inProgress.get(id);
    if (existing) {
        ctx.usedDefs.add(existing);
        return { $ref: `#/$defs/${existing}` };
    }

    const name = defName(type);
    ctx.inProgress.set(id, name);
    const schema = buildObjectSchema(type, ctx);
    ctx.inProgress.delete(id);

    if (ctx.usedDefs.has(name)) {
        ctx.defs[name] = schema;
        return { $ref: `#/$defs/${name}` };
    }
    return schema;
}

/** Translate a TypeScript type into the JSON Schema that `JSON.stringify` would produce. */
export function walkType(type: ts.Type, ctx: WalkContext): JSONSchema {
    const flags = type.flags;

    if (flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
        return {};
    }
    if (flags & ts.TypeFlags.Null) {
        return { type: 'null' };
    }
    if (flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)) {
        return {};
    }
    if (flags & (ts.TypeFlags.BigInt | ts.TypeFlags.BigIntLiteral)) {
        ctx.warnings.push('bigint is not JSON-serializable (JSON.stringify throws); documented as string.');
        return { type: 'string' };
    }
    if (type.isStringLiteral()) {
        return { type: 'string', const: type.value };
    }
    if (type.isNumberLiteral()) {
        return { type: 'number', const: type.value };
    }
    if (flags & ts.TypeFlags.BooleanLiteral) {
        return { type: 'boolean', const: intrinsicName(type) === 'true' };
    }
    if (flags & ts.TypeFlags.String) {
        return { type: 'string' };
    }
    if (flags & ts.TypeFlags.Number) {
        return { type: 'number' };
    }
    if (flags & ts.TypeFlags.Boolean) {
        return { type: 'boolean' };
    }
    if (type.isUnion()) {
        return walkUnion(type, ctx);
    }
    if (flags & ts.TypeFlags.Object || type.isIntersection()) {
        return walkObject(type, ctx);
    }

    return {};
}
