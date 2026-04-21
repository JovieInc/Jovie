import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const STATIC_ROUTE_ROOTS = ['app/(marketing)', 'app/(dynamic)/legal'];
const ROUTE_FILE_EXTENSIONS = new Set(['.ts', '.tsx']);

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
  it('does not allow non-static revalidate exports in marketing or legal routes', () => {
    const repoRoot = process.cwd();
    const routeFiles = STATIC_ROUTE_ROOTS.flatMap(root =>
      listRouteFiles(join(repoRoot, root))
    );
    const dynamicRevalidateExports = routeFiles
      .map(path => ({
        path,
        source: readFileSync(path, 'utf8'),
      }))
      .filter(({ source }) => /export\s+const\s+revalidate\s*=/.test(source))
      .filter(
        ({ source }) =>
          !/export\s+const\s+revalidate\s*=\s*false\s*;/.test(source)
      )
      .map(({ path }) => relative(repoRoot, path));

    expect(dynamicRevalidateExports).toEqual([]);
  });
});
