import { existsSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Risk-register brackets name literal Next.js route directories, not classes. */
export async function listSurfaceFiles(pattern, repoRoot) {
  const pathOnly = pattern.split(':')[0];
  if (!pathOnly.includes('*')) {
    return existsSync(resolve(repoRoot, pathOnly)) ? [pathOnly] : [];
  }
  // Escape in one pass so generated bracket escapes are not escaped again.
  const literalRoutes = pathOnly.replace(/[[\]]/g, char =>
    char === '[' ? '[[]' : '[]]'
  );
  const matched = [];
  for await (const file of glob(literalRoutes, { cwd: repoRoot })) {
    matched.push(file);
  }
  return matched;
}
