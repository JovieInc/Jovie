import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const STATIC_ROUTE_ROOTS = [
  'app/brand',
  'app/(home)',
  'app/(marketing)',
  'app/(dynamic)/legal',
];
const ROUTE_FILE_EXTENSIONS = new Set(['.ts', '.tsx']);
const STATIC_ENTRYPOINT_FILENAMES = new Set([
  'layout.ts',
  'layout.tsx',
  'opengraph-image.ts',
  'opengraph-image.tsx',
  'page.ts',
  'page.tsx',
  'robots.ts',
  'route.ts',
  'route.tsx',
  'sitemap.ts',
  'twitter-image.ts',
  'twitter-image.tsx',
]);
const STATIC_SERVER_GRAPH_ENTRYPOINTS = new Set([
  'app/(marketing)/download/page.tsx',
]);
const FORBIDDEN_REQUEST_TIME_PATTERNS: readonly RegExp[] = [
  /\bheaders\s*\(/,
  /\bcookies\s*\(/,
  /cache\s*:\s*['"]no-store['"]/,
  /from\s+['"]@\/lib\/db['"]/,
  /from\s+['"]@\/lib\/config\/pricing['"]/,
  /from\s+['"]server-only['"]/,
];
const FORBIDDEN_SERVER_GRAPH_PATTERNS: readonly RegExp[] = [
  ...FORBIDDEN_REQUEST_TIME_PATTERNS,
  /\bfetch\s*\(/,
  /next\s*:\s*{\s*revalidate\s*:/,
];
const IMPORT_STATEMENT_PATTERN =
  /\b(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;

function listRouteFiles(directory: string): string[] {
  return readdirSync(directory).flatMap(entry => {
    const path = join(directory, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      return listRouteFiles(path);
    }

    if (
      ![...ROUTE_FILE_EXTENSIONS].some(extension => path.endsWith(extension))
    ) {
      return [];
    }

    return [path];
  });
}

function isStaticEntrypoint(path: string): boolean {
  return STATIC_ENTRYPOINT_FILENAMES.has(path.split(/[\\/]/).at(-1) ?? '');
}

function hasStaticRevalidationPolicy(repoRoot: string, path: string): boolean {
  const staticExport = /export\s+const\s+revalidate\s*=\s*false\b/;
  if (staticExport.test(readFileSync(path, 'utf8'))) return true;

  let directory = dirname(path);
  while (directory.startsWith(`${repoRoot}/`)) {
    for (const filename of ['layout.ts', 'layout.tsx']) {
      const layout = join(directory, filename);
      if (
        existsSync(layout) &&
        staticExport.test(readFileSync(layout, 'utf8'))
      ) {
        return true;
      }
    }
    directory = dirname(directory);
  }
  return false;
}

function isClientBoundary(source: string): boolean {
  return /^['"]use client['"];?/.test(source.trimStart());
}

function resolveLocalImport(
  repoRoot: string,
  importerPath: string,
  specifier: string
): string | null {
  const basePath = specifier.startsWith('@/')
    ? resolve(repoRoot, specifier.slice(2))
    : specifier.startsWith('.')
      ? resolve(dirname(importerPath), specifier)
      : null;

  if (!basePath) return null;

  const candidates = extname(basePath)
    ? [basePath]
    : [
        `${basePath}.ts`,
        `${basePath}.tsx`,
        `${basePath}.js`,
        `${basePath}.jsx`,
        join(basePath, 'index.ts'),
        join(basePath, 'index.tsx'),
        join(basePath, 'index.js'),
        join(basePath, 'index.jsx'),
      ];

  return (
    candidates.find(
      candidate => existsSync(candidate) && statSync(candidate).isFile()
    ) ?? null
  );
}

function listServerLocalImports(
  repoRoot: string,
  importerPath: string,
  source: string
): string[] {
  return [...source.matchAll(IMPORT_STATEMENT_PATTERN)].flatMap(match => {
    const statement = match[0];
    const specifier = match[1];

    if (!specifier || /\b(?:import|export)\s+type\b/.test(statement)) {
      return [];
    }

    const resolved = resolveLocalImport(repoRoot, importerPath, specifier);
    return resolved ? [resolved] : [];
  });
}

function listServerGraphViolations(
  repoRoot: string,
  entrypointPath: string,
  visited = new Set<string>()
): string[] {
  if (visited.has(entrypointPath)) return [];
  visited.add(entrypointPath);

  const source = readFileSync(entrypointPath, 'utf8');
  if (isClientBoundary(source)) return [];

  const relativePath = relative(repoRoot, entrypointPath);
  const currentViolations = FORBIDDEN_SERVER_GRAPH_PATTERNS.filter(pattern =>
    pattern.test(source)
  ).map(pattern => `${relativePath}: server graph forbidden ${pattern.source}`);
  const nestedViolations = listServerLocalImports(
    repoRoot,
    entrypointPath,
    source
  ).flatMap(path => listServerGraphViolations(repoRoot, path, visited));

  return [...currentViolations, ...nestedViolations];
}

describe('static marketing route policy', () => {
  it('inherits static policy from a parent layout without a page export', () => {
    const root = mkdtempSync(join(tmpdir(), 'static-route-policy-'));
    try {
      const directory = join(root, 'app', '(marketing)', 'product', 'feature');
      mkdirSync(directory, { recursive: true });
      const page = join(directory, 'page.tsx');
      writeFileSync(page, 'export default function Page() { return null; }');
      expect(hasStaticRevalidationPolicy(root, page)).toBe(false);
      writeFileSync(
        join(root, 'app', '(marketing)', 'layout.tsx'),
        'export const revalidate = false;'
      );
      expect(hasStaticRevalidationPolicy(root, page)).toBe(true);
      writeFileSync(
        join(root, 'app', '(marketing)', 'layout.tsx'),
        'export const revalidate = 60;'
      );
      expect(hasStaticRevalidationPolicy(root, page)).toBe(false);
      writeFileSync(page, 'export const revalidate = false;');
      expect(hasStaticRevalidationPolicy(root, page)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps marketing and legal route entrypoints fully static', () => {
    const repoRoot = process.cwd();
    const routeFiles = STATIC_ROUTE_ROOTS.flatMap(root =>
      listRouteFiles(join(repoRoot, root))
    );
    const routeSources = routeFiles.map(path => ({
      path,
      relativePath: relative(repoRoot, path),
      source: readFileSync(path, 'utf8'),
    }));
    const staticEntrypointViolations = routeSources
      .filter(({ path }) => isStaticEntrypoint(path))
      .filter(({ path }) => !hasStaticRevalidationPolicy(repoRoot, path))
      .map(
        ({ relativePath }) => `${relativePath}: missing static route policy`
      );
    const requestTimeApiViolations = routeSources.flatMap(
      ({ relativePath, source }) =>
        FORBIDDEN_REQUEST_TIME_PATTERNS.filter(pattern =>
          pattern.test(source)
        ).map(pattern => `${relativePath}: forbidden ${pattern.source}`)
    );
    const dynamicRevalidateExports = routeSources
      .filter(({ source }) => /export\s+const\s+revalidate\s*=/.test(source))
      .filter(
        ({ source }) =>
          !/export\s+const\s+revalidate\s*=\s*false\b/.test(source)
      )
      .map(
        ({ relativePath }) => `${relativePath}: non-static revalidate export`
      );
    const serverGraphViolations = routeSources
      .filter(({ relativePath }) =>
        STATIC_SERVER_GRAPH_ENTRYPOINTS.has(relativePath)
      )
      .flatMap(({ path }) => listServerGraphViolations(repoRoot, path));

    expect([
      ...staticEntrypointViolations,
      ...dynamicRevalidateExports,
      ...requestTimeApiViolations,
      ...serverGraphViolations,
    ]).toEqual([]);
  });
});
