import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const BIOME_BIN = join(REPO_ROOT, 'node_modules/.bin/biome');
const MANIFEST_STDIN_PATH = 'apps/web/screenshot-catalog/current/manifest.json';

/**
 * Serialize a screenshot catalog manifest the way Source Validation formats
 * it. `JSON.stringify` expands short arrays such as `consumers`; Biome wants
 * those arrays on one line. Formatting here keeps the auto-update commit
 * biome-clean.
 */
export function formatScreenshotCatalogManifest(value: unknown): string {
  const raw = `${JSON.stringify(value, null, 2)}\n`;
  const result = spawnSync(
    BIOME_BIN,
    ['format', '--stdin-file-path', MANIFEST_STDIN_PATH],
    {
      cwd: REPO_ROOT,
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
