import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
  buildInventory,
  buildManifest,
  exportsOf,
  MANIFEST,
  main,
  ROOT,
  RUNTIME_SNAPSHOT,
  routePath,
  validateManifest,
} from './artist-launch-contract.mjs';
import { SURFACES } from './artist-launch-policy.mjs';
import { selectSourceGuards } from './ci-fast-lanes.mjs';

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'artist-launch-contract-'));
  const write = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  try {
    run({ root, write });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('checked-in launch inventory matches every current App Router entry point', () => {
  assert.match(main(['--check']), /records; runtime UNVERIFIED/);
  const manifest = JSON.parse(readFileSync(join(ROOT, MANIFEST), 'utf8'));
  assert.deepEqual(validateManifest(manifest), []);
  assert.deepEqual(
    manifest.surfaces.map(s => s.id),
    manifest.surfaces.map(s => s.id).sort()
  );
  assert.deepEqual(manifest.identity.account.key, 'users.id');
  assert.deepEqual(manifest.identity.creatorProfile.key, 'creator_profiles.id');
  assert.equal(manifest.identity.claim.table, 'user_profile_claims');
});

test('deferred launch enforcement snapshot is checked in and manifest-driven', () => {
  const snapshot = JSON.parse(
    readFileSync(join(ROOT, RUNTIME_SNAPSHOT), 'utf8')
  );
  assert.equal(snapshot.schema, 'jovie.deferred-launch-entries/v1');
  for (const route of [
    '/api/dashboard/shop',
    '/api/dashboard/rider',
    '/api/artist-rules',
  ])
    assert.ok(snapshot.handlers[route], route);
  assert.ok(Object.keys(snapshot.handlers).length > 400);
  assert.deepEqual(snapshot.components, [
    'apps/web/app/app/(shell)/library/ArtistRulesSheet.tsx',
    'apps/web/app/app/(shell)/settings/profile/SettingsRiderSection.tsx',
    'apps/web/components/features/dashboard/organisms/SettingsPaySection.tsx',
    'apps/web/components/features/dashboard/organisms/shopify/ShopifyStoreCard.tsx',
  ]);
});

test('regenerates the enforcement snapshot and rejects drift plus transitive control imports', () =>
  fixture(({ root, write }) => {
    // Minimal complete policy lets this exercise the actual CLI's parity boundary.
    for (const surface of SURFACES) {
      for (const route of surface.routes) {
        const prefix = `apps/web/app${route === '/' ? '' : route}`;
        write(
          `${prefix}/${route.startsWith('/api/') || route.includes('/claim') || route.startsWith('/auth/') ? 'route.ts' : 'page.tsx'}`,
          'export const GET = () => {};'
        );
      }
      for (const source of surface.components) write(source, 'export {};');
      const actions = new Map();
      for (const [source, name] of surface.actions)
        actions.set(source, [...(actions.get(source) ?? []), name]);
      for (const [source, names] of actions)
        write(
          source,
          `'use server'; ${names.map(name => `export async function ${name}() {}`).join('\n')}`
        );
    }
    mkdirSync(join(root, 'docs/product'), { recursive: true });
    assert.match(main(['--write'], root), /runtime UNVERIFIED/);

    const snapshot = JSON.parse(
      readFileSync(join(root, RUNTIME_SNAPSHOT), 'utf8')
    );
    assert.equal(snapshot.schema, 'jovie.deferred-launch-entries/v1');
    assert.ok(
      snapshot.components.includes(
        'apps/web/components/features/dashboard/organisms/SettingsPaySection.tsx'
      )
    );

    write(RUNTIME_SNAPSHOT, '{"schema":"jovie.deferred-launch-entries/v1"}\n');
    assert.throws(
      () => main(['--check'], root),
      /deferred launch enforcement snapshot drifted/
    );

    assert.match(main(['--write'], root), /runtime UNVERIFIED/);
    write(
      'apps/web/app/app/new-feature/sneaky.tsx',
      "import { SettingsPaySection } from '@/features/dashboard/organisms/SettingsPaySection';\n"
    );
    assert.throws(() => main(['--check'], root), /deferred control imported/);
    rmSync(join(root, 'apps/web/app/app/new-feature/sneaky.tsx'));
    assert.match(main(['--check'], root), /records/);
  }));

test('maps route groups, parallel auth slots, interception and dynamic segments', () => {
  for (const [source, route] of [
    ['(marketing)/page.tsx', '/'],
    ['app/(shell)/settings/account/page.tsx', '/app/settings/account'],
    ['@auth/(.)signin/page.tsx', '/signin'],
    ['[username]/[...slug]/page.tsx', '/[username]/[...slug]'],
    ['app/@modal/(..)photo/[id]/page.tsx', '/photo/[id]'],
    ['app/@modal/(...)photo/page.tsx', '/photo'],
  ])
    assert.equal(routePath(`apps/web/app/${source}`), route);
});

test('keeps self-serve claim entry points in claim scope and funnel reporting internal', () => {
  const inventory = buildInventory();
  for (const route of ['/claim', '/claim/start']) {
    const record = inventory.find(row => row.route === route);
    assert.equal(record?.surface, 'claim');
    assert.equal(record?.classification, 'B');
  }
  const report = inventory.find(
    row => row.route === '/api/admin/acquisition/artist-offer-funnel'
  );
  assert.equal(report?.surface, 'deferred');
  assert.equal(report?.classification, 'C');
  assert.deepEqual(report?.methods, ['GET']);
});

test('extracts aliased HTTP methods and actions without executing application imports', () => {
  assert.deepEqual(
    exportsOf(
      'route.ts',
      `
    import 'would-throw';
    export { handler as GET, POST, type Body } from './handlers';
    export async function PUT() {}
    export const DELETE = wrapper();
    export type { Params } from './types';
  `
    ),
    { names: ['DELETE', 'GET', 'POST', 'PUT'], server: false }
  );
  assert.deepEqual(
    exportsOf(
      'actions.ts',
      `/* action entry */ 'use server'; export async function save() {};`
    ),
    { names: ['save'], server: true }
  );
});

test('new routes/actions default to C and cannot silently pass inventory parity', () =>
  fixture(({ root, write }) => {
    write('apps/web/app/page.tsx', 'export default function Page() {}');
    const before = buildInventory(root);
    write(
      'apps/web/app/app/new-feature/page.tsx',
      'export default function Feature() {}'
    );
    write(
      'apps/web/app/api/new-feature/route.ts',
      'export { GET, POST } from "./handlers";'
    );
    write(
      'apps/web/app/app/new-feature/actions.ts',
      `/* ownership mutation */ 'use server'; export async function mutate() {}`
    );
    write(
      'apps/web/app/app/new-feature/actions.test.ts',
      `'use server'; export async function testOnly() {}`
    );
    const after = buildInventory(root);
    assert.equal(after.length, before.length + 3);
    const added = after.filter(r => r.source.includes('new-feature'));
    assert.ok(
      added.every(r => r.classification === 'C' && r.surface === 'deferred')
    );
    assert.deepEqual(added.find(r => r.kind === 'handler').methods, [
      'GET',
      'POST',
    ]);
    assert.equal(added.find(r => r.kind === 'action').export, 'mutate');
  }));

test('checks fail on new, removed and renamed routes until the inventory is reviewed', () =>
  fixture(({ root, write }) => {
    // Minimal complete policy lets this exercise the actual CLI's parity boundary.
    for (const surface of SURFACES) {
      for (const route of surface.routes) {
        const prefix = `apps/web/app${route === '/' ? '' : route}`;
        write(
          `${prefix}/${route.startsWith('/api/') || route.includes('/claim') || route.startsWith('/auth/') ? 'route.ts' : 'page.tsx'}`,
          'export const GET = () => {};'
        );
      }
      for (const source of surface.components) write(source, 'export {};');
      const actions = new Map();
      for (const [source, name] of surface.actions)
        actions.set(source, [...(actions.get(source) ?? []), name]);
      for (const [source, names] of actions)
        write(
          source,
          `'use server'; ${names.map(name => `export async function ${name}() {}`).join('\n')}`
        );
    }
    mkdirSync(join(root, 'docs/product'), { recursive: true });
    assert.match(main(['--write'], root), /runtime UNVERIFIED/);
    assert.match(main(['--check'], root), /records/);
    write(
      'apps/web/app/unreviewed/page.tsx',
      'export default function Page() {}'
    );
    assert.throws(() => main(['--check'], root), /inventory drift/);
    rmSync(join(root, 'apps/web/app/unreviewed/page.tsx'));
    rmSync(join(root, 'apps/web/app/signin/page.tsx'));
    assert.throws(() => main(['--check'], root), /orphan (entry|route)/);
  }));

test('rejects broken prerequisites, cycles, missing actions and editing controls', () => {
  const original = buildManifest();
  const change = mutate => {
    const copy = structuredClone(original);
    mutate(copy);
    return validateManifest(copy);
  };
  assert.ok(
    change(m => m.surfaces[0].prerequisites.push('missing')).some(e =>
      e.includes('broken prerequisite')
    )
  );
  assert.ok(
    change(m => m.surfaces[0].prerequisites.push('deferred')).some(e =>
      e.includes('broken prerequisite')
    )
  );
  assert.ok(
    change(m => m.surfaces[0].prerequisites.push('claim')).some(e =>
      e.includes('broken prerequisite')
    )
  );
  assert.ok(
    change(m => (m.surfaces[0].entity = 'creator-profile')).some(e =>
      e.includes('must belong to account')
    )
  );
  assert.ok(
    change(m =>
      m.surfaces
        .find(s => s.id === 'authentication')
        .prerequisites.push('account')
    ).some(e => e.includes('prerequisite cycle'))
  );
  assert.ok(
    change(
      m =>
        (m.inventory = m.inventory.filter(
          r => r.export !== 'updateCreatorProfile'
        ))
    ).some(e => e.includes('missing required action'))
  );
  assert.ok(
    change(
      m =>
        (m.inventory.find(r => r.kind === 'component').source =
          'apps/web/missing.tsx')
    ).some(e => e.includes('missing editing control'))
  );
});

test('rejects declarative deferred leaks and hidden required actions on every channel', () => {
  const original = buildManifest();
  for (const channel of [
    'navigation',
    'settings',
    'deep-link',
    'search',
    'onboarding',
    'api',
    'server-action',
  ]) {
    const copy = structuredClone(original);
    copy.surfaces.find(s => s.id === 'deferred').channels.push(channel);
    assert.ok(
      validateManifest(copy).some(e => e.includes('deferred affordance leak')),
      channel
    );
  }
  const hidden = structuredClone(original);
  hidden.surfaces.find(s => s.id === 'artist-identity').channels = [
    'deep-link',
  ];
  assert.ok(
    validateManifest(hidden).some(e => e.includes('hidden required action'))
  );
  hidden.surfaces[0].entry = null;
  assert.ok(
    validateManifest(hidden).some(e => e.includes('hidden required entry'))
  );
  hidden.surfaces[0].channels = ['deep-link'];
  assert.ok(
    validateManifest(hidden).some(e => e.includes('hidden required api'))
  );
  hidden.status = 'certified';
  assert.ok(
    validateManifest(hidden).some(e => e.includes('cannot certify runtime'))
  );
});

test('runs the cheap launch contract on route changes in PR and combined-head CI', () => {
  for (const event of ['pull_request', 'merge_group', 'push']) {
    for (const path of [
      'apps/web/app/app/new/page.tsx',
      MANIFEST,
      'scripts/artist-launch-policy.mjs',
    ]) {
      assert.ok(
        selectSourceGuards(event, [path]).some(
          g => g.id === 'artist-launch-contract'
        ),
        `${event}: ${path}`
      );
    }
    assert.ok(
      !selectSourceGuards(event, ['apps/ios/Jovie/App.swift']).some(
        g => g.id === 'artist-launch-contract'
      )
    );
  }
});
