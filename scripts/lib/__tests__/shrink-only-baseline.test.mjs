import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'vitest';
import {
  announceShrink,
  compareToBaseline,
  countLeaves,
  tightenBaseline,
} from '../shrink-only-baseline.mjs';

describe('shrink-only baseline semantic', () => {
  test('growth fails: a higher count, a new rule and a new file', () => {
    const baseline = { 'a.tsx': { tile: 2 } };
    assert.deepEqual(
      compareToBaseline({ 'a.tsx': { tile: 3 } }, baseline).growth,
      [{ path: ['a.tsx', 'tile'], count: 3, baseline: 2 }]
    );
    assert.equal(
      compareToBaseline({ 'a.tsx': { tile: 2, step: 1 } }, baseline).growth
        .length,
      1
    );
    assert.equal(
      compareToBaseline(
        { 'a.tsx': { tile: 2 }, 'b.tsx': { tile: 1 } },
        baseline
      ).growth.length,
      1
    );
  });

  test('a shrink is reported as headroom, never as growth', () => {
    const baseline = { 'a.tsx': { tile: 2 }, 'b.tsx': { tile: 1 } };
    const result = compareToBaseline({ 'a.tsx': { tile: 1 } }, baseline);
    assert.deepEqual(result.growth, []);
    assert.deepEqual(result.shrink, [
      { path: ['a.tsx', 'tile'], count: 1, baseline: 2 },
      { path: ['b.tsx', 'tile'], count: 0, baseline: 1 },
    ]);
  });

  test('debt that moves between keys is growth on the new key', () => {
    // offer-claims, 2026-11: a claim moved from verified-upgrade.ts to
    // price-versions.ts. The total is flat; the new file still gained debt.
    const result = compareToBaseline(
      { 'new.ts': { claim: 2 }, 'old.ts': { claim: 1 } },
      { 'old.ts': { claim: 2 } }
    );
    assert.equal(result.growth.length, 1);
    assert.deepEqual(result.growth[0].path, ['new.ts', 'claim']);
  });

  test('flat baselines use the same functions', () => {
    const result = compareToBaseline(
      { 'rule::a.tsx': 2 },
      { 'rule::a.tsx': 1, 'rule::b.tsx': 4 }
    );
    assert.equal(result.growth.length, 1);
    assert.equal(result.shrink.length, 1);
  });

  test('tightening lowers and deletes; it never raises and never adds', () => {
    const baseline = {
      'a.tsx': { tile: 2, step: 1 },
      'b.tsx': { tile: 1 },
      'c.tsx': { tile: 1 },
    };
    const current = {
      'a.tsx': { tile: 5 }, // grew: must stay at 2 so the check still fails
      'c.tsx': { tile: 1 },
      'new.tsx': { tile: 9 }, // unbaselined: must not be adopted
    };
    const next = tightenBaseline(current, baseline);
    assert.deepEqual(next.baseline, {
      'a.tsx': { tile: 2 },
      'c.tsx': { tile: 1 },
    });
    assert.equal(next.tightened.length, 2);
    assert.equal(compareToBaseline(current, next.baseline).growth.length, 2);
    // Idempotent, and a clean tree leaves the baseline byte-identical.
    assert.deepEqual(
      tightenBaseline(current, next.baseline).baseline,
      next.baseline
    );
    assert.deepEqual(tightenBaseline(baseline, baseline).tightened, []);
  });

  test('malformed leaves fail loudly instead of comparing as zero', () => {
    assert.throws(() => countLeaves({ a: { b: -1 } }), /non-negative integer/);
    assert.throws(() => countLeaves({ a: '2' }), /non-negative integer/);
    assert.throws(
      () => tightenBaseline({}, { a: 1.5 }),
      /non-negative integer/
    );
  });

  test('shrink is one notice per guard and empty when there is nothing to say', () => {
    const lines = [];
    const log = line => lines.push(line);
    assert.equal(announceShrink('g', [], { env: {}, log }), '');
    announceShrink(
      'design-noise',
      [{ path: ['a.tsx', 'tile'], count: 0, baseline: 2 }],
      { env: { GITHUB_ACTIONS: 'true' }, log }
    );
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^::notice title=baseline can be tightened::/);
    assert.match(lines[0], /a\.tsx > tile 2 -> 0/);
  });
});

// The class this module removes: two individually green PRs that go red when
// a merge group combines them. Real git, real merges, the real functions.
describe('two green branches stay green on the combined tree', () => {
  const git = (cwd, ...args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_SYSTEM: '/dev/null',
        GIT_AUTHOR_NAME: 't',
        GIT_AUTHOR_EMAIL: 't@example.com',
        GIT_COMMITTER_NAME: 't',
        GIT_COMMITTER_EMAIL: 't@example.com',
      },
    });
  // The "scanner": one unit of debt per line that says DEBT.
  const measure = root => {
    const counts = {};
    for (const file of ['a.txt', 'b.txt', 'c.txt']) {
      const hits = readFileSync(join(root, file), 'utf8').match(/DEBT/g);
      if (hits) counts[file] = { debt: hits.length };
    }
    return counts;
  };
  const baselineOf = root =>
    JSON.parse(readFileSync(join(root, 'baseline.json'), 'utf8'));
  const exactMatch = root => {
    const { growth, shrink } = compareToBaseline(
      measure(root),
      baselineOf(root)
    );
    return growth.length === 0 && shrink.length === 0;
  };
  const green = root =>
    compareToBaseline(measure(root), baselineOf(root)).growth.length === 0;

  function seed() {
    const root = mkdtempSync(join(tmpdir(), 'baseline-combine-'));
    git(root, 'init', '-q', '-b', 'main');
    writeFileSync(join(root, 'a.txt'), 'DEBT\nDEBT\n');
    writeFileSync(join(root, 'b.txt'), 'DEBT\n');
    writeFileSync(join(root, 'c.txt'), 'clean\n');
    writeFileSync(
      join(root, 'baseline.json'),
      `${JSON.stringify(measure(root), null, 2)}\n`
    );
    git(root, 'add', '.');
    git(root, 'commit', '-q', '-m', 'seed');
    return root;
  }
  const branch = (root, name, edit) => {
    git(root, 'checkout', '-q', '-b', name, 'main');
    edit();
    git(root, 'commit', '-q', '-am', name);
  };

  test('two PRs that each remove debt from a different entry merge clean and pass', () => {
    const root = seed();
    try {
      branch(root, 'pr-a', () => writeFileSync(join(root, 'a.txt'), 'DEBT\n'));
      assert.ok(green(root), 'PR A is green alone');
      branch(root, 'pr-b', () => writeFileSync(join(root, 'b.txt'), 'ok\n'));
      assert.ok(green(root), 'PR B is green alone');

      git(root, 'checkout', '-q', '-b', 'merge-group', 'main');
      git(root, 'merge', '-q', '--no-ff', '-m', 'A', 'pr-a');
      git(root, 'merge', '-q', '--no-ff', '-m', 'B', 'pr-b');
      assert.equal(git(root, 'status', '--porcelain'), '');
      assert.ok(green(root), 'the combined head is green');
      // Red before green: the exact-match rule this replaces fails this
      // head, and failed PR A and PR B alone, for removing debt.
      assert.equal(exactMatch(root), false);

      // The follow-up tighten locks both gains in and stays green.
      const next = tightenBaseline(measure(root), baselineOf(root));
      assert.deepEqual(next.baseline, { 'a.txt': { debt: 1 } });
      writeFileSync(
        join(root, 'baseline.json'),
        `${JSON.stringify(next.baseline, null, 2)}\n`
      );
      assert.ok(exactMatch(root));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('growth still fails: alone, in the combined tree, and after tightening', () => {
    const root = seed();
    try {
      branch(root, 'pr-fix', () => writeFileSync(join(root, 'b.txt'), 'ok\n'));
      branch(root, 'pr-grow', () =>
        writeFileSync(join(root, 'c.txt'), 'DEBT\n')
      );
      assert.equal(green(root), false, 'new debt fails on its own PR');

      git(root, 'checkout', '-q', '-b', 'merge-group', 'main');
      git(root, 'merge', '-q', '--no-ff', '-m', 'fix', 'pr-fix');
      git(root, 'merge', '-q', '--no-ff', '-m', 'grow', 'pr-grow');
      const combined = compareToBaseline(measure(root), baselineOf(root));
      assert.deepEqual(combined.growth, [
        { path: ['c.txt', 'debt'], count: 1, baseline: 0 },
      ]);
      // A fix elsewhere does not buy room for new debt, and tightening
      // cannot absorb it either.
      const next = tightenBaseline(measure(root), baselineOf(root));
      assert.equal(
        compareToBaseline(measure(root), next.baseline).growth.length,
        1
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
