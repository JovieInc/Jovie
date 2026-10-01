import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * JOV-6189: one server-state lifecycle, one retry owner.
 *
 * TanStack Query (`lib/queries`) owns request-backed server state —
 * cache, same-scope dedupe, invalidation, and retries via the JOV-6185
 * classified policy. TanStack Pacer (`lib/pacer`) owns local
 * debounce/throttle scheduling. The parallel `lib/fetch/deduped-fetch`
 * in-flight request cache + TTL response cache lifecycle was retired as
 * a confirmed-dead alternative: at removal time it had zero live
 * consumers (only its own tests and doc references).
 *
 * This contract keeps it retired. Raw `fetch` remains legitimate inside
 * `lib/queries` transport, server-only code, streaming, uploads, and
 * one-shot imperative transport — nothing here bans it.
 */

const testDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(testDir, '..', '..', '..', '..');

const SOURCE_DIRECTORIES = ['app', 'components', 'hooks', 'lib', 'scripts'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);

const SKIP_DIRECTORIES = new Set([
  'node_modules',
  '__tests__',
  '.next',
  'dist',
  'build',
  'coverage',
]);

const REMOVED_MODULE_IMPORT_REGEX =
  /from\s+['"]@\/lib\/fetch(?:\/(?:deduped-fetch|use-deduped-fetch))?['"]/;

const REMOVED_SYMBOL_REGEX =
  /\b(?:dedupedFetch|dedupedFetchWithMeta|useDedupedFetch|useDedupedFetchAll)\b/;

function read(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), 'utf8');
}

/** Collect production source files (tests excluded) under web root. */
function collectSourceFiles(): string[] {
  const files: string[] = [];

  function walk(currentPath: string): void {
    for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      if (/\.test\.tsx?$/.test(entry.name)) continue;

      const fullPath = join(currentPath, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (SOURCE_EXTENSIONS.has(entry.name.slice(-4))) {
        files.push(fullPath);
      }
    }
  }

  for (const dir of SOURCE_DIRECTORIES) {
    const absoluteDir = resolve(webRoot, dir);
    if (!existsSync(absoluteDir)) continue;
    walk(absoluteDir);
  }

  return files;
}

describe('retired fetch lifecycle contract (JOV-6189)', () => {
  it('removes the lib/fetch dedupe/cache module', () => {
    expect(existsSync(resolve(webRoot, 'lib/fetch'))).toBe(false);
  });

  it('keeps production source free of the removed module imports', () => {
    for (const filePath of collectSourceFiles()) {
      expect(
        readFileSync(filePath, 'utf8').match(REMOVED_MODULE_IMPORT_REGEX)
      ).toBeNull();
    }
  });

  it('keeps production source free of the removed symbols', () => {
    for (const filePath of collectSourceFiles()) {
      expect(
        readFileSync(filePath, 'utf8').match(REMOVED_SYMBOL_REGEX)
      ).toBeNull();
    }
  });

  it('keeps the isolated-surface registry free of non-Query cache owners', () => {
    // registerIsolatedCacheSurface existed solely so the retired
    // deduped-fetch responseCache could clear itself on cache fences.
    // With that sole registrant gone, the registry hook is retired too.
    const cacheIsolation = read('lib/queries/cache-isolation.ts');
    expect(cacheIsolation).not.toContain('registerIsolatedCacheSurface');
    expect(cacheIsolation).not.toContain('isolatedSurfaces');

    const queriesBarrel = read('lib/queries/index.ts');
    expect(queriesBarrel).not.toContain('registerIsolatedCacheSurface');
  });

  it('keeps the transport decoder docblock free of removed-surface claims', () => {
    const transport = read('lib/queries/fetch.ts');
    expect(transport).not.toContain('dedupedFetch');
  });
});
