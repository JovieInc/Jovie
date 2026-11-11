import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compare,
  issueBodies,
  ownerValues,
  scan,
  shrink,
} from './duplicate-literals.mjs';

const map = {
  scanExcludes: ['\\.test\\.'],
  domains: [{ id: 'plans', title: 'Plans', owner: { ref: 'owner.ts' } }],
  scans: [
    {
      id: 'price',
      domain: 'plans',
      label: 'Plan price',
      owner: 'owner.ts',
      extract: ['monthlyUsd:\\s*(\\d+)'],
      literal: ['\\${n}(?![\\d])', '\\b{n}\\s*/\\s*mo\\b'],
      scope: ['apps'],
      exts: ['.tsx'],
      allow: ['apps/allowed.tsx'],
    },
  ],
};
const files = {
  'owner.ts': 'monthlyUsd: 12,',
  'apps/a.tsx': 'Pro is $12 a month, or 12/mo. Not $120.',
  'apps/b.tsx': 'Pro is {PRICE}',
  'apps/a.test.tsx': '$12',
  'apps/allowed.tsx': '$12',
};
const read = p => files[p] ?? '';

test('extracts owner values and flags copies outside the owner', () => {
  assert.deepEqual(ownerValues(map.scans[0], files['owner.ts']), ['12']);
  assert.deepEqual(scan(map, Object.keys(files), read), {
    price: { 'apps/a.tsx': 2 },
  });
});

test('a stale extract pattern fails loudly instead of passing empty', () => {
  assert.throws(
    () => scan(map, [], () => 'nothing here'),
    /no values extracted/
  );
});

test('ratchet: new or grown offenders fail, shrinking is allowed, ledger never grows', () => {
  const found = { price: { 'apps/a.tsx': 2, 'apps/new.tsx': 1 } };
  const { violations, shrinkable } = compare(found, {
    price: { 'apps/a.tsx': 1, 'apps/gone.tsx': 1 },
  });
  assert.deepEqual(violations.map(v => v.file).sort(), [
    'apps/a.tsx',
    'apps/new.tsx',
  ]);
  assert.deepEqual(
    shrinkable.map(v => v.file),
    ['apps/gone.tsx']
  );
  assert.deepEqual(
    shrink(found, { price: { 'apps/a.tsx': 1, 'apps/gone.tsx': 1 } }),
    { price: { 'apps/a.tsx': 1 } }
  );
});

test('one issue per domain with the offender list', () => {
  const [issue] = issueBodies(map, { price: { 'apps/a.tsx': 2 } });
  assert.equal(issue.domain, 'plans');
  assert.match(issue.body, /apps\/a\.tsx/);
});
