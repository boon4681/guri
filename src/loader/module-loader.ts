/**
 * `require.cache` helpers for the dev watcher: purge stale modules so the next build re-evaluates
 * them. The import graph itself is built statically in `import-graph.ts` (require.cache only
 * records edges for modules that were actually evaluated, which misses statically-synced routes).
 */
import { resolve, sep } from 'node:path';

export interface ModuleGraph {
    importers: Map<string, Set<string>>;
    nodes: Set<string>;
}

const toSlash = (path: string): string => path.split(sep).join('/');

const isProjectModule = (id: string, root: string): boolean => {
    return id.startsWith(root) && !id.includes(`${sep}node_modules${sep}`) && !id.includes(`${sep}.giri${sep}`);
}

export const collectDependents = (graph: ModuleGraph, start: string): Set<string> => {
    const out = new Set<string>([start]);
    const stack = [start];
    while (stack.length > 0) {
        const current = stack.pop()!;
        for (const importer of graph.importers.get(current) ?? []) {
            if (!out.has(importer)) {
                out.add(importer);
                stack.push(importer);
            }
        }
    }
    return out;
};

export const purgeModules = (files: Set<string>): void => {
    for (const id of Object.keys(require.cache)) {
        if (files.has(toSlash(id))) {
            delete require.cache[id];
        }
    }
};

/**
 * Drop every cached module under the project root (skipping `node_modules` and `.giri`).
 */
export const purgeProjectModules = (cwd: string): void => {
    const root = resolve(cwd) + sep;
    for (const id of Object.keys(require.cache)) {
        if (isProjectModule(id, root)) {
            delete require.cache[id];
        }
    }
};

export const purgeGeneratedModules = (outDir: string): void => {
    const root = resolve(outDir) + sep;
    for (const id of Object.keys(require.cache)) {
        if (resolve(id).startsWith(root)) {
            delete require.cache[id];
        }
    }
};