import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
/** The only modules allowed to accept a display session: Home feeds, read only. */
const ALLOWED = [
  'app/api/admin/hud/founder-funnel/route.ts',
  'app/api/hud/metrics/route.ts',
  'app/api/hud/shipping-state/route.ts',
  'app/api/ovie/display/session/route.ts',
  'app/api/ovie/inbox/route.ts',
  'app/display/page.tsx',
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.'))
      continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(path);
  }
  return out;
}

describe('display session scope', () => {
  it('only the Home feed routes and the display page import the display server module', () => {
    const importers = [
      ...walk(join(ROOT, 'app')),
      ...walk(join(ROOT, 'lib')),
      ...walk(join(ROOT, 'components')),
    ]
      .filter(file =>
        /@\/lib\/ovie\/display\/server/.test(readFileSync(file, 'utf8'))
      )
      .map(file => relative(ROOT, file))
      .sort();
    expect(importers).toEqual(ALLOWED);
  });
  it('every importing API route is GET-only (a display session can never write)', () => {
    for (const file of ALLOWED.filter(f => f.startsWith('app/api/'))) {
      if (file.endsWith('display/session/route.ts')) continue;
      const source = readFileSync(join(ROOT, file), 'utf8');
      expect(source, file).not.toMatch(
        /export\s+(async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b/
      );
    }
  });
});
