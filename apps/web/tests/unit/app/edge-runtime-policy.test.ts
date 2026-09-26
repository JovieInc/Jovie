import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_ROOT = join(__dirname, '../../../app');
const ROUTE_FILE_EXTENSIONS = ['.ts', '.tsx'];
const EDGE_RUNTIME_DECLARATION = /export\s+const\s+runtime\s*=\s*['"]edge['"]/;

function listRouteFiles(directory: string): string[] {
  return readdirSync(directory).flatMap(entry => {
    const path = join(directory, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      return listRouteFiles(path);
    }

    if (!ROUTE_FILE_EXTENSIONS.some(extension => path.endsWith(extension))) {
      return [];
    }

    return [path];
  });
}

describe('edge runtime policy', () => {
  it('does not declare the deprecated Edge Runtime anywhere under app/', () => {
    const offenders = listRouteFiles(APP_ROOT).filter(path =>
      EDGE_RUNTIME_DECLARATION.test(readFileSync(path, 'utf8'))
    );

    expect(offenders).toEqual([]);
  });
});
