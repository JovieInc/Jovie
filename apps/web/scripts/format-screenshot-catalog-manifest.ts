import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const MANIFEST_STDIN_PATH = 'apps/web/screenshot-catalog/current/manifest.json';

// Playwright loads this module from catalog.spec.ts as CommonJS. `import.meta`
// makes that loader emit an ESM wrapper that throws `exports is not defined`
// before Generate's catalog step can run.
function repoRootFrom(start: string): string {
  let dir = resolve(start);
  for (let depth = 0; depth < 8; depth += 1) {
    if (
      existsSync(join(dir, 'biome.json')) &&
      existsSync(join(dir, 'pnpm-workspace.yaml'))
    ) {
      return dir;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    'screenshot catalog manifest formatter could not find the repo root'
  );
}

/**
 * Serialize a screenshot catalog manifest the way Source Validation formats
 * it. `JSON.stringify` expands short arrays such as `consumers`; Biome wants
 * those arrays on one line. Formatting here keeps the auto-update commit
 * biome-clean.
 */
export function formatScreenshotCatalogManifest(value: unknown): string {
  const repoRoot = repoRootFrom(process.cwd());
  const raw = `${JSON.stringify(value, null, 2)}\n`;
  const result = spawnSync(
    join(repoRoot, 'node_modules/.bin/biome'),
    ['format', '--stdin-file-path', MANIFEST_STDIN_PATH],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      input: raw,
    }
  );

  if (result.error) {
    throw new Error(
      `screenshot catalog manifest could not be formatted: ${result.error.message}`
    );
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(
      `screenshot catalog manifest is not biome-clean: ${detail}`
    );
  }

  const formatted = result.stdout;
  if (!formatted.endsWith('\n')) {
    throw new Error(
      'screenshot catalog manifest formatter omitted the trailing newline'
    );
  }
  return formatted;
}
