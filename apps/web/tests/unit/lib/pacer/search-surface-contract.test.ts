import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(testDir, '..', '..', '..', '..');

function read(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), 'utf8');
}

/**
 * JOV-6189: one server-state lifecycle and one retry owner per search
 * operation. `lib/pacer/hooks/useAsyncSearch.ts` duplicated the
 * results/errors/retries lifecycle that
 * `lib/queries/useUnifiedArtistSearchQuery.ts` already owns (TanStack
 * Query cache/invalidation + Pacer debounce), with zero live consumers.
 * This contract keeps the retired hook out of the Pacer surface and pins
 * the canonical owner.
 */
describe('pacer search surface contract', () => {
  it('retires the competing useAsyncSearch hook file', () => {
    expect(() => read('lib/pacer/hooks/useAsyncSearch.ts')).toThrow();
  });

  it('keeps the pacer barrels free of useAsyncSearch exports', () => {
    const barrels = [
      'lib/pacer/hooks.ts',
      'lib/pacer/hooks/index.ts',
      'lib/pacer/index.ts',
    ];
    for (const barrel of barrels) {
      expect(read(barrel)).not.toContain('useAsyncSearch');
    }
  });

  it('keeps the canonical search lifecycle owner in lib/queries', () => {
    const canonical = read('lib/queries/useUnifiedArtistSearchQuery.ts');
    expect(canonical).toContain('useQuery');
    expect(canonical).toContain('useAsyncDebouncer');
  });

  it('keeps the live pacer hooks exported from the barrels', () => {
    const hooksBarrel = read('lib/pacer/hooks/index.ts');
    for (const liveHook of [
      'useAsyncValidation',
      'useAutoSave',
      'useDebouncedInput',
      'useRateLimitedValidation',
      'useThrottledEventHandler',
      'useThrottledScroll',
    ]) {
      expect(hooksBarrel).toContain(liveHook);
    }
  });
});
