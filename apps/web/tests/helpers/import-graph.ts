import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import ts from 'typescript';

/**
 * Static import-graph tracer for bundle boundary tests.
 *
 * Walks the value imports reachable from an apps/web entry file so a test can
 * assert that a client entry never reaches a server-only or heavyweight
 * module. The ESLint `server-only-imports` rule only inspects the direct
 * imports of `'use client'` files; this covers the transitive graph.
 */

const WEB_ROOT = resolve(__dirname, '../..');

/** Longest prefix first, mirroring `paths` in apps/web/tsconfig.json. */
const ALIASES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['@/atoms/', ['components/atoms/']],
  ['@/molecules/', ['components/molecules/']],
  ['@/organisms/', ['components/organisms/']],
  ['@/features/', ['components/features/']],
  ['@/app/', ['app/', 'app/app/']],
  ['@/', ['']],
];

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];

const USE_SERVER_DIRECTIVE =
  /^(?:\s|\/\/.*\n|\/\*[\s\S]*?\*\/)*['"]use server['"]/;

export interface ModuleImports {
  /** `import x from`, `export x from`, and side-effect imports. */
  readonly static: readonly string[];
  /** `import('...')` expressions, which ship as separate lazy chunks. */
  readonly dynamic: readonly string[];
}

/**
 * Runtime import specifiers of a module. Type-only imports and exports, and
 * `import('x').Type` references in type positions, are erased by the compiler
 * and never reach a bundle, so they are skipped.
 */
export function collectValueImports(
  source: string,
  fileName = 'module.tsx'
): ModuleImports {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    false
  );
  const staticImports: string[] = [];
  const dynamicImports: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      if (
        !node.importClause?.isTypeOnly &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        staticImports.push(node.moduleSpecifier.text);
      }
      return;
    }
    if (ts.isExportDeclaration(node)) {
      if (
        !node.isTypeOnly &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        staticImports.push(node.moduleSpecifier.text);
      }
      return;
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const [specifier] = node.arguments;
      if (specifier && ts.isStringLiteralLike(specifier)) {
        dynamicImports.push(specifier.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return { static: staticImports, dynamic: dynamicImports };
}

function resolveFile(base: string): string | null {
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const ext of EXTENSIONS) {
    if (existsSync(base + ext)) return base + ext;
  }
  for (const ext of EXTENSIONS) {
    const indexFile = resolve(base, `index${ext}`);
    if (existsSync(indexFile)) return indexFile;
  }
  return null;
}

function resolveSpecifier(specifier: string, fromFile: string): string | null {
  if (specifier.startsWith('.')) {
    return resolveFile(resolve(dirname(fromFile), specifier));
  }
  for (const [prefix, targets] of ALIASES) {
    if (!specifier.startsWith(prefix)) continue;
    const rest = specifier.slice(prefix.length);
    for (const target of targets) {
      const found = resolveFile(resolve(WEB_ROOT, target + rest));
      if (found) return found;
    }
    return null;
  }
  return null;
}

export interface ImportGraph {
  /**
   * Every import specifier seen, exactly as written, mapped to the chain of
   * apps/web-relative files that first reached it.
   */
  readonly specifiers: ReadonlyMap<string, readonly string[]>;
  /** Every apps/web file reached, mapped to the chain that first reached it. */
  readonly files: ReadonlyMap<string, readonly string[]>;
}

export interface TraceImportGraphOptions {
  /**
   * Follow `import()` edges too. Leave off to model the eagerly loaded graph;
   * turn on when a module must not ship to the browser at all, lazy or not.
   */
  readonly followDynamicImports?: boolean;
}

/**
 * Breadth-first walk of the value imports reachable from an apps/web-relative
 * entry file. Bare package imports are recorded but not followed.
 */
export function traceImportGraph(
  entry: string,
  options: TraceImportGraphOptions = {}
): ImportGraph {
  const entryFile = resolve(WEB_ROOT, entry);
  const specifiers = new Map<string, readonly string[]>();
  const files = new Map<string, readonly string[]>([[entry, [entry]]]);
  const queue: Array<{ file: string; chain: readonly string[] }> = [
    { file: entryFile, chain: [entry] },
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    const source = readFileSync(current.file, 'utf8');
    // Server Action modules are an RPC boundary: client bundles receive
    // generated stubs, never the module body or its imports.
    if (current.file !== entryFile && USE_SERVER_DIRECTIVE.test(source)) {
      continue;
    }

    const imports = collectValueImports(source, current.file);
    const followed = options.followDynamicImports
      ? [...imports.static, ...imports.dynamic]
      : imports.static;

    for (const specifier of followed) {
      if (!specifiers.has(specifier)) specifiers.set(specifier, current.chain);

      const resolved = resolveSpecifier(specifier, current.file);
      if (!resolved) continue;
      const relativePath = relative(WEB_ROOT, resolved);
      if (relativePath.startsWith('..') || files.has(relativePath)) continue;

      const chain = [...current.chain, relativePath];
      files.set(relativePath, chain);
      queue.push({ file: resolved, chain });
    }
  }

  return { specifiers, files };
}

/** Human-readable `match via a -> b -> c` lines for assertion output. */
export function describeMatches(
  reached: ReadonlyMap<string, readonly string[]>,
  patterns: readonly RegExp[]
): string[] {
  return [...reached.entries()]
    .filter(([key]) => patterns.some(pattern => pattern.test(key)))
    .map(([key, chain]) => `${key} via ${chain.join(' -> ')}`);
}
