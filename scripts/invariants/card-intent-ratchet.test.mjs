import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BASELINE_PATH,
  compare,
  countSource,
  inventory,
  isScanned,
  isStateFile,
  scan,
  shrink,
} from './card-intent-ratchet.mjs';

const SAMPLE = [
  "import { Card } from '@jovie/ui';",
  'export const A = () => (',
  '  <div>',
  '    <Card>flat</Card>',
  "    <Card intent='collection'>peer</Card>",
  '    <ContentSurfaceCard className="x" />',
  "    <DrawerSurfaceCard variant='card' intent='transient'>t</DrawerSurfaceCard>",
  '    <CardTitle>not a primitive</CardTitle>',
  '  </div>',
  ');',
].join('\n');

test('counts primitives and which carry an intent', () => {
  assert.deepEqual(countSource(SAMPLE, 'apps/web/components/A.tsx'), {
    total: 4,
    untyped: 2,
  });
});

test('scope skips tests, stories, primitives and non-TSX', () => {
  assert.equal(isScanned('apps/web/components/A.tsx'), true);
  assert.equal(isScanned('apps/web/components/A.test.tsx'), false);
  assert.equal(isScanned('apps/web/components/A.stories.tsx'), false);
  assert.equal(isScanned('packages/ui/atoms/card.tsx'), false);
  assert.equal(isScanned('scripts/x.tsx'), false);
  assert.equal(isScanned('apps/web/lib/a.ts'), false);
});

test('recognises empty, loading and error state files', () => {
  for (const f of [
    'apps/web/components/TableEmptyState.tsx',
    'apps/web/app/x/loading.tsx',
    'apps/web/app/x/error.tsx',
    'apps/web/components/FooSkeleton.tsx',
    'apps/web/components/SettingsErrorState.tsx',
  ])
    assert.equal(isStateFile(f), true, f);
  assert.equal(isStateFile('apps/web/components/ReleaseCard.tsx'), false);
});

test('deliberate-red: a card in an empty state fails even with an intent', () => {
  const files = { 'apps/web/components/FooEmptyState.tsx': SAMPLE };
  const found = scan(Object.keys(files), p => files[p]);
  assert.deepEqual(found.stateViolations, [
    'apps/web/components/FooEmptyState.tsx',
  ]);
  const { violations } = compare(found, {
    total: 2,
    files: { 'apps/web/components/FooEmptyState.tsx': 2 },
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0], /always flat/u);
});

test('deliberate-red: growth in total or per file fails', () => {
  const files = { 'apps/web/components/A.tsx': SAMPLE };
  const found = scan(Object.keys(files), p => files[p]);
  assert.deepEqual(found.untyped, { 'apps/web/components/A.tsx': 2 });
  assert.equal(
    compare(found, { total: 2, files: { 'apps/web/components/A.tsx': 2 } })
      .violations.length,
    0
  );
  const grown = compare(found, {
    total: 1,
    files: { 'apps/web/components/A.tsx': 1 },
  });
  assert.equal(grown.violations.length, 2);
  const newFile = compare(found, { total: 2, files: {} });
  assert.equal(newFile.violations.length, 1);
});

test('shrinking is allowed, reported, and --write never grows the ledger', () => {
  const found = {
    untyped: { 'apps/web/components/A.tsx': 1 },
    stateViolations: [],
  };
  const baseline = {
    total: 5,
    files: { 'apps/web/components/A.tsx': 3, 'apps/web/components/B.tsx': 2 },
  };
  const { violations, shrinkable } = compare(found, baseline);
  assert.equal(violations.length, 0);
  assert.equal(shrinkable.length, 2);
  const next = shrink(found, baseline);
  assert.deepEqual(next.files, { 'apps/web/components/A.tsx': 1 });
  assert.equal(next.total, 1);
  const grown = shrink(
    { untyped: { 'apps/web/components/A.tsx': 9 }, stateViolations: [] },
    baseline
  );
  assert.equal(grown.files['apps/web/components/A.tsx'], 3);
});

test('inventory groups untyped usages by area', () => {
  const areas = inventory({
    'apps/web/components/features/dashboard/a/X.tsx': 2,
    'apps/web/components/features/dashboard/b/Y.tsx': 1,
    'apps/web/components/molecules/Z.tsx': 4,
    'packages/ui/atoms/W.tsx': 1,
  });
  assert.equal(areas['apps/web/components/features/dashboard'], 3);
  assert.equal(areas['apps/web/components/molecules'], 4);
  assert.equal(areas['packages/ui'], 1);
});

test('baseline path is committed next to the script', () => {
  assert.equal(
    BASELINE_PATH,
    'scripts/invariants/card-intent-ratchet.baseline.json'
  );
});
