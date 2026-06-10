import ts from 'typescript';
import type { GiriPaths } from '../../types';

const DEFAULT_OPTIONS: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
};

export interface SchemaProgramOptions {
    /**
     * Skip ambient `types` packages for the first response-schema pass. This keeps
     * TypeScript semantics, but avoids loading broad globals like `@types/node`
     * unless extraction later proves it needs the full project program.
     */
    lean?: boolean;
}

function leanOptions(options: ts.CompilerOptions): ts.CompilerOptions {
    return {
        ...options,
        types: [],
    };
}

/**
 * Build a `ts.Program` rooted at the given route files, using the project's own
 * `tsconfig.json` (so `paths`, `rootDirs`, and the user's TS settings apply). The
 * walker reads types from this program; nothing is emitted.
 */
export function createSchemaProgram(
    paths: GiriPaths,
    routeFiles: string[],
    programOptions: SchemaProgramOptions = {},
): ts.Program {
    let options: ts.CompilerOptions = { ...DEFAULT_OPTIONS };

    const configPath = ts.findConfigFile(paths.cwd, ts.sys.fileExists, 'tsconfig.json');
    if (configPath) {
        const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, {
            ...ts.sys,
            onUnRecoverableConfigFileDiagnostic: () => {},
        });
        if (parsed) {
            options = { ...parsed.options, noEmit: true };
        }
    }

    if (programOptions.lean) {
        options = leanOptions(options);
    }

    return ts.createProgram(routeFiles, options);
}
