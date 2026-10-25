import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sw = readFileSync(resolve(__dirname, '../../../public/sw.js'), 'utf8');
const offline = readFileSync(
  resolve(__dirname, '../../../public/offline.html'),
  'utf8'
);

// Offer truth: a stale service-worker cache must never be able to serve old
// price or trial copy. The worker is network-first and caches one static page.
describe('service worker cannot cache offer copy', () => {
  it('only ever adds the offline page to a cache', () => {
    const adds = [...sw.matchAll(/cache\.(add|addAll|put)\(([^)]*)\)/g)];
    expect(adds.length).toBeGreaterThan(0);
    for (const m of adds) {
      expect(m[1]).toBe('add');
      expect(m[2]).toBe('OFFLINE_PAGE');
    }
  });

  it('offline page states no price, trial or billing terms', () => {
    expect(offline).not.toMatch(
      /\$\s?\d|\btrial\b|per month|\/\s?mo\b|no (credit )?card|cancel anytime/i
    );
  });
});
