import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const STATIC_ROUTE_ROOTS = ['app/(marketing)', 'app/(dynamic)/legal'];
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
const FORBIDDEN_REQUEST_TIME_PATTERNS: readonly RegExp[] = [
  /\bheaders\s*\(/,
  /\bcookies\s*\(/,
  /cache\s*:\s*['"]no-store['"]/,
];

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

describe('static marketing route policy', () => {
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
      .filter(
        ({ path, source }) =>
          STATIC_ENTRYPOINT_FILENAMES.has(path.split(/[\\/]/).at(-1) ?? '') &&
          !/^\s*['"]use client['"];/m.test(source)
      )
      .filter(
        ({ source }) =>
          !/export\s+const\s+revalidate\s*=\s*false\b/.test(source)
      )
      .map(({ relativePath }) => `${relativePath}: missing revalidate=false`);
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

    expect([
      ...staticEntrypointViolations,
      ...dynamicRevalidateExports,
      ...requestTimeApiViolations,
    ]).toEqual([]);
  });
});
