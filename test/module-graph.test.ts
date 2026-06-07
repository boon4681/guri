import { collectDependents, type ModuleGraph } from '../src/loader/module-loader';

function graphFrom(edges: Record<string, string[]>): ModuleGraph {
    const importers = new Map<string, Set<string>>();
    const nodes = new Set<string>();
    for (const [importer, deps] of Object.entries(edges)) {
        nodes.add(importer);
        for (const dep of deps) {
            nodes.add(dep);
            const set = importers.get(dep) ?? new Set<string>();
            set.add(importer);
            importers.set(dep, set);
        }
    }
    return { importers, nodes };
}

describe('collectDependents', () => {
    it('walks the transitive importer chain', () => {
        const graph = graphFrom({ 'a.ts': ['b.ts'], 'b.ts': ['c.ts'] });

        expect([...collectDependents(graph, 'c.ts')].sort()).toEqual(['a.ts', 'b.ts', 'c.ts']);
        expect([...collectDependents(graph, 'b.ts')].sort()).toEqual(['a.ts', 'b.ts']);
        expect([...collectDependents(graph, 'a.ts')]).toEqual(['a.ts']);
    });

    it('handles a shared dependency imported by several files and tolerates cycles', () => {
        // auth.ts is imported by two routes; r1 and r2 also import each other (cycle).
        const graph = graphFrom({
            'r1.ts': ['auth.ts', 'r2.ts'],
            'r2.ts': ['auth.ts', 'r1.ts'],
        });

        expect([...collectDependents(graph, 'auth.ts')].sort()).toEqual(['auth.ts', 'r1.ts', 'r2.ts']);
        expect([...collectDependents(graph, 'orphan.ts')]).toEqual(['orphan.ts']);
    });
});
