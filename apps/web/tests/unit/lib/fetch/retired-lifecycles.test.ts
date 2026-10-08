import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// JOV-6189: lib/queries owns server state; the retired lib/fetch
// dedupe/cache lifecycle must not return. Raw `fetch` stays fine.

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const RETIRED =
  /@\/lib\/fetch['"/]|\b(?:dedupedFetch|dedupedFetchWithMeta|useDedupedFetch|useDedupedFetchAll)\b/;
const SOURCE_DIRS = ['app', 'components', 'hooks', 'lib', 'scripts'];
const SKIP_DIR = /^(?:node_modules|__tests__|dist|build|coverage|\..*)$/;
const SOURCE_FILE = /\.(?:ts|tsx|js|jsx|mjs)$/;
const TEST_FILE = /\.test\.tsx?$/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIR.test(entry.name)) sourceFiles(full, out);
    } else if (SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const read = (rel: string) => readFileSync(resolve(webRoot, rel), 'utf8');

describe('retired fetch lifecycle contract (JOV-6189)', () => {
  it('keeps lib/fetch removed and production source clean of it', { timeout: 60000 }, () => {
    expect(existsSync(resolve(webRoot, 'lib/fetch'))).toBe(false);
    for (const dir of SOURCE_DIRS) {
      const abs = resolve(webRoot, dir);
      if (!existsSync(abs)) continue;
      for (const file of sourceFiles(abs)) {
        expect(readFileSync(file, 'utf8').match(RETIRED)).toBeNull();
      }
    }
  });

  it('keeps queries free of the retired isolated-surface registry', () => {
    const cacheIsolation = read('lib/queries/cache-isolation.ts');
    expect(cacheIsolation).not.toMatch(
      /registerIsolatedCacheSurface|isolatedSurfaces/
    );
    expect(read('lib/queries/index.ts')).not.toContain(
      'registerIsolatedCacheSurface'
    );
    expect(read('lib/queries/fetch.ts')).not.toContain('dedupedFetch');
  });
});
