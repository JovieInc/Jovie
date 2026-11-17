import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

const committedRegistry = JSON.parse(
  readFileSync(
    new URL('../../canon/product-surfaces.json', import.meta.url),
    'utf8'
  )
);
const runCommitted = overrides =>
  run({
    registry: committedRegistry,
    appDirs: Object.keys(committedRegistry.apps),
    readFile: () => '',
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

test('Console cannot return as a justified independent app (JOV-8893)', () => {
  const restoredRegistry = {
    ...committedRegistry,
    apps: {
      ...committedRegistry.apps,
      'apps/console': {
        product: 'jovie',
        kind: 'independent',
        justification: 'console app',
      },
    },
  };
  assert.match(
    run({
      registry: restoredRegistry,
      appDirs: Object.keys(restoredRegistry.apps),
      trackedFiles: ['apps/console/package.json'],
      readFile: () => '',
    }).join('\n'),
    /ovie: parallel implementation tracked at apps\/console\/package\.json/
  );
});

for (const [file, content] of [
  [
    'package.json',
    '{"scripts":{"dev:console":"pnpm --filter @jovie/console run dev"}}',
  ],
  ['package.json', '{"scripts":{"sweep:taste-inbox":"some-launcher"}}'],
  [
    'apps/web/package.json',
    '{"scripts":{"ops":"pnpm --filter @jovie/console run dev"}}',
  ],
  ['pnpm-workspace.yaml', "packages: ['apps/console']"],
  ['turbo.json', '{"tasks":{"@jovie/console#dev":{"persistent":true}}}'],
  ['.github/workflows/build.yml', 'run: pnpm --filter @jovie/console build'],
  ['scripts/ci-fast-lanes.mjs', "const paths = ['apps/console/package.json'];"],
  [
    'scripts/node-runtime-bump.mjs',
    "const paths = ['apps/console/package.json'];",
  ],
  [
    'config/node-runtime-policy.json',
    '{"majorPinned":["apps/console/package.json"]}',
  ],
  ['.codex/hooks.json', '{"command":"pnpm run dev:console"}'],
  ['.codex/environments/environment.toml', 'command = "pnpm run dev:console"'],
  ['.onlook/project.json', '{"package":"@jovie/console"}'],
  ['vercel.json', '{"buildCommand":"pnpm --filter @jovie/console build"}'],
  [
    'apps/ovie/vercel.json',
    '{"buildCommand":"pnpm --filter @jovie/console build"}',
  ],
]) {
  test(`retired Console launch reference fails in ${file}: ${content}`, () => {
    assert.match(
      runCommitted({
        trackedFiles: [file],
        readFile: path => (path === file ? content : ''),
      }).join('\n'),
      /still launches or selects retired ops surface/
    );
  });
}

test('historical artifacts and the retirement record remain readable', () => {
  const history = [
    'docs/operations/evidence/2026-06-20/package.json',
    'docs/architecture/data-architecture-adr-2026-10-29.md',
    'docs/operations/evidence/2026-10-26/typecheck.txt',
    'CHANGELOG.md',
    'canon/ownership.json',
  ];
  assert.deepEqual(
    runCommitted({
      trackedFiles: history,
      readFile: () =>
        'retired apps/console (@jovie/console); dev:console; sweep:taste-inbox',
    }),
    []
  );
});

test('normal Jovie and Ovie launch configuration passes', () => {
  assert.deepEqual(
    runCommitted({
      trackedFiles: ['package.json', '.github/workflows/ci.yml'],
      readFile: () =>
        'pnpm --filter @jovie/ovie run dev; /app/ov/inbox; console.log("ready")',
    }),
    []
  );
});
