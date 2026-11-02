import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALIAS_ROUTE_SURFACE,
  CERTIFIED_SCHEMA,
  readCertifiedSurfaces,
  splitAliasRoutes,
} from '../alias-gate-certified-routes.mjs';
import { ALIAS_ROUTES } from '../public-profile-alias-graduation.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts/lib/alias-gate-certified-routes.mjs');
const body = (surfaces, ledger = 'present') =>
  JSON.stringify({
    schema: CERTIFIED_SCHEMA,
    ledger,
    certifiedSurfaces: surfaces,
  });

describe('alias gate certified routes', () => {
  it('maps every gated alias route to a real golden-path surface', () => {
    const ledgerSource = readFileSync(
      resolve(
        ROOT,
        'apps/web/lib/ovie/certifications/prod-golden-path-ledger.ts'
      ),
      'utf8'
    );
    const block = ledgerSource.slice(
      ledgerSource.indexOf('export const PROD_GOLDEN_PATH_SURFACES = {'),
      ledgerSource.indexOf('} as const satisfies')
    );
    const surfaces = new Set(
      [...block.matchAll(/^\s+'?([a-z-]+)'?: \{ title:/gm)].map(m => m[1])
    );
    expect(surfaces.has('public-profile')).toBe(true);
    expect(Object.keys(ALIAS_ROUTE_SURFACE).sort()).toEqual(
      [...ALIAS_ROUTES].sort()
    );
    for (const surface of Object.values(ALIAS_ROUTE_SURFACE))
      expect(surfaces.has(surface)).toBe(true);
  });

  it('blocks only routes whose surface is certified', () => {
    const certified = readCertifiedSurfaces(
      body(['landing', 'public-profile'])
    );
    expect(certified.certification).toBe('present');
    expect(splitAliasRoutes(ALIAS_ROUTES, certified.surfaces)).toEqual({
      blocking: [...ALIAS_ROUTES],
      warning: [],
    });
    const uncertified = readCertifiedSurfaces(body(['landing']));
    expect(splitAliasRoutes(ALIAS_ROUTES, uncertified.surfaces)).toEqual({
      blocking: [],
      warning: [...ALIAS_ROUTES],
    });
  });

  it('certifies nothing when the ledger is missing, malformed or unreachable', () => {
    expect(readCertifiedSurfaces(body([], 'missing'))).toMatchObject({
      certification: 'missing',
    });
    for (const text of [
      '',
      '<html>502</html>',
      JSON.stringify({
        schema: 'other/v1',
        certifiedSurfaces: ['public-profile'],
      }),
      JSON.stringify({
        schema: CERTIFIED_SCHEMA,
        certifiedSurfaces: 'public-profile',
      }),
      JSON.stringify({ schema: CERTIFIED_SCHEMA, certifiedSurfaces: [7] }),
      'null',
    ]) {
      const parsed = readCertifiedSurfaces(text);
      expect(parsed.certification, text).toBe('unavailable');
      expect(parsed.surfaces.size, text).toBe(0);
    }
  });

  it('rejects a gated route that has no golden-path surface', () => {
    expect(() => splitAliasRoutes(['checkout-alias'], new Set())).toThrow(
      'no golden-path surface'
    );
  });

  it('prints GitHub output lines from stdin', () => {
    const run = input =>
      spawnSync(
        process.execPath,
        [SCRIPT, 'public-profile-listen', 'public-profile-tip'],
        {
          input,
          encoding: 'utf8',
        }
      );
    const certified = run(body(['public-profile']));
    expect(certified.status).toBe(0);
    expect(certified.stdout).toBe(
      'certification=present\nblocking=public-profile-listen public-profile-tip\nwarning=\n'
    );
    expect(run('').stdout).toBe(
      'certification=unavailable\nblocking=\nwarning=public-profile-listen public-profile-tip\n'
    );
  });
});
