import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  assessCertificate,
  formatStatus,
  newGates,
  planOrders,
  remaining,
  STATIC_CRITERIA,
  verifyOrder,
} from '../ds-cert-loop.mjs';

const ALL = [...STATIC_CRITERIA];
const cert = (component, overrides = {}) => ({
  component,
  criteria: STATIC_CRITERIA.map(id => ({
    id,
    status: overrides[id] ?? 'pass',
  })),
});
const report = (...certificates) => ({ certificates });

describe('ds-cert-loop', () => {
  it('a passing, exactly gated component is done', () => {
    const row = assessCertificate(cert('a/A.tsx'), { 'a/A.tsx': ALL });
    assert.equal(row.done, true);
    assert.deepEqual(row.failing, []);
  });

  it('counts na as clear and a gate prefix as gated', () => {
    const row = assessCertificate(cert('a/A.tsx', { tests: 'na' }), {
      'a/': ALL,
    });
    assert.equal(row.done, true);
  });

  it('a gate missing a static criterion does not count', () => {
    const six = ALL.filter(id => id !== 'forced-caps');
    const row = assessCertificate(cert('a/A.tsx'), { 'a/A.tsx': six });
    assert.equal(row.gated, false);
    assert.equal(row.done, false);
  });

  it('marks token and owner failures as source fixes', () => {
    const tokens = assessCertificate(cert('a/A.tsx', { tokens: 'fail' }));
    const tests = assessCertificate(cert('a/B.tsx', { tests: 'fail' }));
    assert.equal(tokens.source, true);
    assert.equal(tests.source, false);
  });

  it('lists what is left in path order', () => {
    const rows = remaining(
      report(cert('b/B.tsx'), cert('a/A.tsx'), cert('c/C.tsx')),
      { 'c/C.tsx': ALL }
    );
    assert.deepEqual(
      rows.map(r => r.component),
      ['a/A.tsx', 'b/B.tsx']
    );
  });

  it('plans fixed-size orders with stable ids', () => {
    const rows = remaining(
      report(...['a', 'b', 'c', 'd', 'e'].map(n => cert(`${n}/X.tsx`)))
    );
    const orders = planOrders(rows, { size: 2, headSha: 'abc' });
    assert.deepEqual(
      orders.map(o => [o.id, o.components.length, o.headSha]),
      [
        ['dsc-01', 2, 'abc'],
        ['dsc-02', 2, 'abc'],
        ['dsc-03', 1, 'abc'],
      ]
    );
    assert.throws(() => planOrders(rows, { size: 0 }));
  });

  it('verify passes only when every component is done or skipped', () => {
    const gates = { 'a/A.tsx': ALL };
    const r = report(cert('a/A.tsx'), cert('b/B.tsx', { tokens: 'fail' }));
    const failed = verifyOrder(['a/A.tsx', 'b/B.tsx', 'c/C.tsx'], r, gates);
    assert.equal(failed.ok, false);
    assert.equal(failed.done, 1);
    assert.deepEqual(failed.problems, [
      'b/B.tsx: fails tokens',
      'b/B.tsx: no gate entry with all 7 static criteria',
      'c/C.tsx: not found by the certifier',
    ]);
    const skipped = verifyOrder(['a/A.tsx', 'b/B.tsx'], r, gates, {
      'b/B.tsx': 'needs a product decision',
    });
    assert.equal(skipped.ok, true);
    assert.equal(skipped.skipped, 1);
  });

  it('new gates cover only passing, ungated components', () => {
    const r = report(
      cert('b/B.tsx'),
      cert('a/A.tsx'),
      cert('c/C.tsx', { a11y: 'fail' }),
      cert('d/D.tsx')
    );
    const added = newGates(r, { 'd/': ALL });
    assert.deepEqual(Object.keys(added), ['a/A.tsx', 'b/B.tsx']);
    assert.deepEqual(added['a/A.tsx'], ALL);
    assert.deepEqual(Object.keys(newGates(r, {}, ['b/B.tsx'])), ['b/B.tsx']);
  });

  it('says to stand down at zero', () => {
    assert.match(formatStatus([]), /stand down/);
    assert.match(
      formatStatus(remaining(report(cert('a/A.tsx', { tokens: 'fail' })))),
      /1 components left \(1 need a source fix, 0 need evidence only\)/
    );
  });
});
