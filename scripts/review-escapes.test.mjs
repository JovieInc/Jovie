import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addsGuard,
  attributeLayer,
  findEscapes,
  summarize,
} from './review-escapes.mjs';

const commit = (pr, subject, ts, files = [], body = '') => ({
  sha: `sha${pr}`,
  ts,
  subject: `${subject} (#${pr})`,
  body,
  files: files.map(([path, added = 1]) => ({ path, added })),
});
const H = 3600;

test('a fix naming an earlier PR within 48h is an escape of that PR', () => {
  const commits = [
    commit(100, 'feat(billing): add price', 0, [['apps/web/lib/billing/x.ts']]),
    commit(
      101,
      'fix(billing): wrong rounding',
      5 * H,
      [['apps/web/lib/billing/x.ts']],
      'Follow-up to #100'
    ),
  ];
  const [escape] = findEscapes(commits);
  assert.equal(escape.originPr, 100);
  assert.equal(escape.fixPr, 101);
  assert.equal(escape.layer, 'risk_tier_review');
  assert.equal(escape.guardAdded, false);
});

test('fixes beyond 48h, dependency bumps and fix-of-fix are not escapes', () => {
  const commits = [
    commit(201, 'feat: a', 0),
    commit(202, 'fix: late', 49 * H, [], 'after #201'),
    commit(203, 'deps(deps): bump', 0),
    commit(204, 'fix: dep drift', H, [], 'bump #203'),
    commit(205, 'fix: first', 0),
    commit(206, 'fix: second', H, [], 'fixes #205'),
  ];
  assert.deepEqual(findEscapes(commits), []);
});

test('layer attribution follows the fix paths and honors overrides', () => {
  const origin = { files: [{ path: 'apps/web/a.ts' }] };
  const fix = paths => ({ files: paths.map(path => ({ path })) });
  assert.equal(
    attributeLayer(origin, fix(['.github/workflows/ci.yml'])),
    'ci_guard'
  );
  assert.equal(
    attributeLayer(origin, fix(['apps/web/tests/e2e/smoke.spec.ts'])),
    'production_cert'
  );
  assert.equal(attributeLayer(origin, fix(['biome.json'])), 'preflight');
  assert.equal(attributeLayer(origin, fix(['apps/web/a.ts'])), 'unit_test');
  const commits = [
    commit(301, 'feat: a', 0),
    commit(302, 'fix: b', H, [['apps/web/a.ts']], 'for #301'),
  ];
  assert.equal(
    findEscapes(commits, { labels: { 301: 'preflight' } })[0].layer,
    'preflight'
  );
});

test('a fix that adds test lines leaves a guard and the summary reports rates', () => {
  assert.equal(addsGuard({ files: [{ path: 'a.test.ts', added: 3 }] }), true);
  assert.equal(addsGuard({ files: [{ path: 'a.ts', added: 3 }] }), false);
  const commits = [
    commit(401, 'feat: a', 0),
    commit(402, 'fix: b', H, [['a.ts']], 'for #401'),
    commit(403, 'feat: c', 0),
    commit(404, 'feat: d', 0),
    commit(405, 'feat: e', 0),
  ];
  const summary = summarize(commits, findEscapes(commits), { days: 30 });
  assert.equal(summary.mergedPrs, 4);
  assert.equal(summary.escapedPrs, 1);
  assert.equal(summary.escapeRate, 0.25);
  assert.equal(summary.guardRate, 0);
  assert.equal(summary.unguarded[0].originPr, 401);
});
