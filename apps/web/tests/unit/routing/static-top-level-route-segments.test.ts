import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { STATIC_TOP_LEVEL_ROUTE_SEGMENTS } from '@/lib/routing/static-top-level-route-segments';

const WEB_ROOT = path.resolve(__dirname, '../../..');

function appTopLevelSegments(dir: string, out: Set<string>) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (!statSync(full).isDirectory()) continue;
    if (/^\(.*\)$/.test(name)) {
      appTopLevelSegments(full, out);
      continue;
    }
    if (/^[_@[]/.test(name)) continue;
    out.add(name.toLowerCase());
  }
  return out;
}

describe('profile publication gate route exclusions', () => {
  it('lists every top-level app route, public entry and metadata route', () => {
    const expected = [
      ...appTopLevelSegments(path.join(WEB_ROOT, 'app'), new Set()),
      ...readdirSync(path.join(WEB_ROOT, 'public')).map(n => n.toLowerCase()),
      'robots.txt',
      'sitemap.xml',
      'manifest.webmanifest',
    ];
    const missing = expected.filter(
      segment => !STATIC_TOP_LEVEL_ROUTE_SEGMENTS.has(segment)
    );
    expect(missing).toEqual([]);
  });
});
