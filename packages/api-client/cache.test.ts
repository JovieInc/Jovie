import { mkdtemp, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { cacheable, FileResponseCache, toCached } from './cache.ts';
import {
  priorityPolicy,
  providerForUrl,
  providerSpec,
  resourceFor,
} from './contract.ts';

const root = () => mkdtemp(join(tmpdir(), 'api-cache-'));

describe('FileResponseCache and contract lookups', () => {
  it('round-trips cached bodies and prunes entries past their age', async () => {
    const dir = await root();
    const cache = new FileResponseCache(dir, 'github', 1000);
    const headers = new Headers({
      etag: '"a"',
      'content-type': 'application/json',
    });
    const now = Date.now();
    await cache.set('k1', toCached(200, headers, '{"a":1}', now));
    expect(await cache.get('k1')).toMatchObject({
      etag: '"a"',
      body: '{"a":1}',
    });
    expect(await cache.get('missing')).toBeNull();
    const stale = join(cache.dir, 'old.json');
    await writeFile(stale, '{}');
    const old = new Date(now - 10_000);
    await utimes(stale, old, old);
    for (let i = 0; i < 50; i += 1)
      await cache.set(`k${i + 2}`, toCached(200, headers, '{}', now));
    expect(await cache.get('old')).toBeNull();
    expect(
      cacheable(200, new Headers({ 'cache-control': 'no-store' }), '{}')
    ).toBe(false);
  });

  it('maps URLs to providers and resources from providers.json', () => {
    expect(providerForUrl('https://sentry.io/api/0/projects/')).toBe('sentry');
    expect(providerForUrl('https://sentry.io/welcome/')).toBeNull();
    expect(providerForUrl('https://example.com/')).toBeNull();
    expect(resourceFor('github', 'https://api.github.com/search/issues')).toBe(
      'search'
    );
    expect(() => providerSpec('nope')).toThrow(/unknown API provider/);
    expect(() => priorityPolicy('urgent' as never)).toThrow(
      /unknown API priority/
    );
  });
});
