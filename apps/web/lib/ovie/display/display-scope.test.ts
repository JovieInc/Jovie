import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const SERVER_MODULE = 'lib/ovie/display/server';
/** The only modules allowed to accept a display session: Home feeds, read only. */
const ALLOWED = [
  'app/api/admin/hud/founder-funnel/route.ts',
  'app/api/hud/metrics/route.ts',
  'app/api/hud/shipping-state/route.ts',
  'app/api/ovie/display/session/route.ts',
  'app/api/ovie/inbox/route.ts',
  'app/display/page.tsx',
];
const WRITE_METHODS = '(?:POST|PUT|PATCH|DELETE)';
const SPECIFIER =
  /(?:from\s*|import\s*\(\s*|require\s*\(\s*|import\s+)['"]([^'"]+)['"]/g;

/** Every module specifier a source file imports, requires, re-exports or dynamically imports. */
export function specifiersOf(source: string): string[] {
  return [...source.matchAll(SPECIFIER)].map(match => match[1]!);
}

/** Does `source` (at repo-relative `file`) load the display server module, by alias or relative path? */
export function importsDisplayServer(file: string, source: string): boolean {
  return specifiersOf(source).some(specifier => {
    const resolved = specifier.startsWith('.')
      ? normalize(join(dirname(file), specifier))
      : specifier.replace(/^@\//, '');
    return resolved === SERVER_MODULE || resolved === `${SERVER_MODULE}.ts`;
  });
}

/** Does `source` export a write handler in any syntax? */
export function exportsWriteHandler(source: string): boolean {
  return [
    new RegExp(`export\\s+(?:async\\s+)?function\\s+${WRITE_METHODS}\\b`),
    new RegExp(`export\\s+(?:const|let|var)\\s+${WRITE_METHODS}\\b`),
    new RegExp(`export\\s*\\{[^}]*\\b${WRITE_METHODS}\\b[^}]*\\}`),
  ].some(pattern => pattern.test(source));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.'))
      continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(?:[cm]?[jt]sx?)$/.test(name) && !/\.test\./.test(name))
      out.push(path);
  }
  return out;
}

describe('display session scope', () => {
  it('only the Home feed routes and the display page load the display server module (whole app, incl. proxy.ts)', () => {
    const importers = walk(ROOT)
      .map(path => relative(ROOT, path))
      .filter(file => file !== `${SERVER_MODULE}.ts`)
      .filter(file =>
        importsDisplayServer(file, readFileSync(join(ROOT, file), 'utf8'))
      )
      .sort();
    expect(importers).toEqual(ALLOWED);
  });

  it('every importing API route other than the exchange is GET-only', () => {
    for (const file of ALLOWED.filter(
      f => f.startsWith('app/api/') && !f.includes('display/session')
    )) {
      expect(
        exportsWriteHandler(readFileSync(join(ROOT, file), 'utf8')),
        file
      ).toBe(false);
    }
  });

  it('the exchange is POST only: no GET, so a proof can never ride a URL', () => {
    const source = readFileSync(
      join(ROOT, 'app/api/ovie/display/session/route.ts'),
      'utf8'
    );
    expect(source).not.toMatch(/export\s+(?:async\s+)?function\s+GET\b/);
    expect(source).not.toMatch(/export\s+(?:const|let|var)\s+GET\b/);
  });
});

describe('display scope detectors (deliberate red)', () => {
  it('catches alias, relative, dynamic and require loads from any directory', () => {
    const cases: [string, string][] = [
      ['proxy.ts', "import { x } from '@/lib/ovie/display/server';"],
      ['proxy.ts', "import { x } from './lib/ovie/display/server';"],
      [
        'app/api/other/route.ts',
        "import { x } from '../../../lib/ovie/display/server';",
      ],
      ['lib/a.ts', "const m = await import('@/lib/ovie/display/server');"],
      ['lib/a.ts', "const m = require('./ovie/display/server');"],
      [
        'lib/a.ts',
        "export { isDisplayReadRequest } from './ovie/display/server';",
      ],
    ];
    for (const [file, source] of cases)
      expect(importsDisplayServer(file, source), `${file}: ${source}`).toBe(
        true
      );
  });
  it('does not flag unrelated or sibling modules', () => {
    expect(
      importsDisplayServer(
        'lib/a.ts',
        "import { x } from '@/lib/ovie/display/session';"
      )
    ).toBe(false);
    expect(
      importsDisplayServer(
        'lib/a.ts',
        "import { x } from './ovie/display/server-other';"
      )
    ).toBe(false);
  });
  it('catches every write-export syntax', () => {
    for (const source of [
      'export async function POST() {}',
      'export function DELETE() {}',
      'export const POST = async () => {};',
      'export let PATCH = handler;',
      'const PUT = h; export { PUT };',
      'export { handler as POST, GET };'.replace('handler as POST', 'POST'),
    ])
      expect(exportsWriteHandler(source), source).toBe(true);
    expect(exportsWriteHandler('export async function GET() {}')).toBe(false);
  });
});
