import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SURFACES_SCHEMA,
  validateSurfaces,
} from './one-surface-per-product.mjs';

const registry = {
  schema: SURFACES_SCHEMA,
  products: {
    ovie: {
      shell: 'apps/web /app/ov',
      forbiddenRepos: ['JovieInc/ovie'],
      forbiddenTrackedPaths: ['(^|/)Sources/Ovie/', '^apps/ovie-mac/'],
    },
  },
  registryFiles: ['reg.json'],
  apps: {
    'apps/web': { kind: 'shell' },
    'apps/x': { kind: 'independent', justification: 'separate product' },
  },
};
const run = overrides =>
  validateSurfaces({
    registry,
    appDirs: ['apps/web', 'apps/x'],
    trackedFiles: ['apps/web/a.ts'],
    readFile: () => '{"repo":"JovieInc/Jovie"}',
    ...overrides,
  });

test('clean tree passes', () => assert.deepEqual(run(), []));

test('unregistered app directory fails', () => {
  const p = run({ appDirs: ['apps/web', 'apps/x', 'apps/ovie-mac2'] });
  assert.match(p.join('\n'), /apps\/ovie-mac2 is not registered/);
});

test('independent app needs a justification', () => {
  const r = {
    ...registry,
    apps: { ...registry.apps, 'apps/x': { kind: 'independent' } },
  };
  assert.match(
    validateSurfaces({
      registry: r,
      appDirs: ['apps/web', 'apps/x'],
      trackedFiles: [],
      readFile: () => '',
    }).join('\n'),
    /need a justification/
  );
});

test('native Ovie implementation fails', () => {
  assert.match(
    run({ trackedFiles: ['x/Sources/Ovie/OvieApp.swift'] }).join('\n'),
    /parallel implementation/
  );
  assert.match(
    run({ trackedFiles: ['apps/ovie-mac/a'] }).join('\n'),
    /parallel implementation/
  );
});

test('retired repo in a registry fails', () => {
  assert.match(
    run({ readFile: () => 'JovieInc/ovie' }).join('\n'),
    /retired repository/
  );
});

test('stale registration fails', () => {
  assert.match(run({ appDirs: ['apps/web'] }).join('\n'), /no longer exists/);
});
