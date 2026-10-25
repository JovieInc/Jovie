import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const APP = path.resolve(__dirname, '../../../app');
const READ_OPT_IN = /(?:access|purpose):\s*'read'/g;
const HANDLER =
  /export (?:async function|const) (GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)\b/g;

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === 'route.ts' ? [full] : [];
  });
}

/** The exported handler (method) that encloses `index`, by nearest preceding export. */
function enclosingHandler(source: string, index: number): string | null {
  let method: string | null = null;
  for (const match of source.matchAll(HANDLER)) {
    if (match.index > index) break;
    method = match[1];
  }
  return method;
}

function exportedMethods(source: string): string[] {
  return [...source.matchAll(HANDLER)].map(match => match[1]);
}

// Guard for the read-only operator role: an explicit read opt-in
// (`access: 'read'` or `purpose: 'read'`) may only appear inside a GET or HEAD
// handler, or inside a helper of a file that exports nothing but GET/HEAD. A
// write handler passing it would let a read-only operator mutate.
describe('read-only operator opt-ins live only in GET/HEAD handlers', () => {
  const offenders: string[] = [];
  let seen = 0;
  for (const file of routeFiles(path.join(APP, 'api'))) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(READ_OPT_IN)) {
      seen += 1;
      const method = enclosingHandler(source, match.index);
      const readOnlyFile = exportedMethods(source).every(
        name => name === 'GET' || name === 'HEAD'
      );
      const allowed =
        method === 'GET' ||
        method === 'HEAD' ||
        (method === null && readOnlyFile);
      if (!allowed) {
        offenders.push(
          `${path.relative(APP, file)}: ${match[0]} inside ${method ?? 'a helper of a file with write handlers'}`
        );
      }
    }
  }

  it('finds the existing opt-ins (guard is live)', () => {
    expect(seen).toBeGreaterThan(20);
  });

  it('has no opt-in outside a GET/HEAD handler', () => {
    expect(offenders).toEqual([]);
  });
});

// Read access is granted in exactly these modules. Anything else importing the
// read-level helpers would spread the role beyond the audited gates (page access,
// requireAdmin, requireOvieApiAccess, getOvieOperatorEntitlements).
const READ_LEVEL_ALLOWLIST = new Set([
  'lib/admin/roles.ts',
  'lib/admin/index.ts',
  'lib/admin/middleware.ts',
  'lib/admin/page-access.ts',
  'lib/ovie/privacy-lock/access.ts',
  'lib/db/schema/auth.ts', // comment only
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === 'node_modules' || name === '.next'
        ? []
        : sourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(name) && !/\.(test|stories)\./.test(name)
      ? [full]
      : [];
  });
}

describe('read-level helpers are confined to the audited gates', () => {
  it('is imported only by the allowlisted modules', () => {
    const root = path.resolve(__dirname, '../../..');
    const offenders = ['app', 'lib'].flatMap(dir =>
      sourceFiles(path.join(root, dir))
        .filter(file => {
          const rel = path.relative(root, file);
          return (
            !READ_LEVEL_ALLOWLIST.has(rel) &&
            /\b(hasAdminReadAccess|getAdminAccess|hasAdminReadRole)\b/.test(
              readFileSync(file, 'utf8')
            )
          );
        })
        .map(file => path.relative(root, file))
    );
    expect(offenders.sort()).toEqual([
      'app/app/(shell)/admin/layout.tsx',
      'app/app/(shell)/shell-mode.ts',
    ]);
  });
});
