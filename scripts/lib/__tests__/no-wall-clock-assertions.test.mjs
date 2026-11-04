import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  findWallClockAssertions,
  listGatingTestFiles,
  scanRepo,
} from '../wall-clock-assertions.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const baseline = JSON.parse(
  readFileSync(
    resolve(REPO_ROOT, 'scripts/lib/wall-clock-assertion-baseline.json'),
    'utf8'
  )
).files;

describe('wall-clock assertion detector', () => {
  it('reports the assertion line once after blank lines and comments', () => {
    expect(
      findWallClockAssertions(
        '\n\n// timing check\nassert.ok(elapsed < 1000);\n'
      )
    ).toEqual([4]);
  });

  it('keeps opt-outs attached to the actual wrapped assertion', () => {
    expect(
      findWallClockAssertions(
        '\n\n// wall-clock-ok: injected clock\nexpect(\n  elapsedMs\n).toBeLessThan(5);\n'
      )
    ).toEqual([]);
    expect(
      findWallClockAssertions(
        'expect(\n  elapsedMs\n).toBeLessThan(5); // wall-clock-ok: injected clock\n'
      )
    ).toEqual([]);
  });

  it('ignores fixture strings and comments without excluding test files', () => {
    expect(listGatingTestFiles(REPO_ROOT)).toContain(
      'scripts/lib/__tests__/no-wall-clock-assertions.test.mjs'
    );
    expect(
      findWallClockAssertions(
        readFileSync(fileURLToPath(import.meta.url), 'utf8')
      )
    ).toEqual([]);
    expect(
      findWallClockAssertions(
        '// expect(elapsed).toBeLessThan(5);\n' +
          'const fixture = `assert.ok(elapsed < 1);`;\n' +
          'expect(elapsed).toBeLessThan(5);\n'
      )
    ).toEqual([3]);
  });

  it('finds assertions past four lines and in semicolon-free code', () => {
    expect(
      findWallClockAssertions(
        'expect(\n\n\n\n\n elapsed\n).toBeLessThan(5)\nassert.ok(duration < 10)\n'
      )
    ).toEqual([1, 8]);
  });

  it('does not apply an inline opt-out to the next assertion', () => {
    expect(
      findWallClockAssertions(
        'expect(elapsed).toBeLessThan(5); // wall-clock-ok: injected clock\n' +
          'assert.ok(Date.now() - started < 1000);'
      )
    ).toEqual([2]);
  });

  it('detects clock reads on either side of a comparison', () => {
    expect(
      findWallClockAssertions(
        'assert.ok(1000 > elapsed);\nexpect(500).toBeGreaterThan(Date.now() - start);'
      )
    ).toEqual([1, 2]);
    expect(
      findWallClockAssertions('expect(expiresAt).toBeGreaterThan(Date.now());')
    ).toEqual([]);
  });

  it('keeps clock comparisons executable inside TSX and template expressions', () => {
    expect(
      findWallClockAssertions(
        'const view = <div />;\nexpect(Date.now() - started).toBeGreaterThan(0);',
        'x.test.tsx'
      )
    ).toEqual([2]);
    expect(
      findWallClockAssertions('const text = `${assert.ok(elapsed < 5)}`;')
    ).toEqual([1]);
    expect(
      findWallClockAssertions('expect("elapsed").toBeLessThan(5);')
    ).toEqual([]);
    expect(
      findWallClockAssertions(
        'assert.ok(elapsed < 5, "wall-clock-ok: only a string");'
      )
    ).toEqual([1]);
  });

  it('flags duration comparisons in JS and Python', () => {
    expect(
      findWallClockAssertions(
        'const t = Date.now();\nexpect(Date.now() - t).toBeLessThan(500);\n'
      )
    ).toEqual([2]);
    expect(
      findWallClockAssertions(
        'assert.ok(\n  Date.now() - started < 1000,\n  "msg"\n);\n'
      )
    ).toEqual([1]);
    expect(
      findWallClockAssertions(
        'expect(\n  performance.now() - a\n).toBeLessThan(2_000);\n'
      )
    ).toEqual([1]);
    expect(
      findWallClockAssertions('    assert elapsed < 2.0\n', 'test_x.py')
    ).toEqual([1]);
  });

  it('ignores deterministic assertions and honours the opt-out', () => {
    expect(
      findWallClockAssertions('expect(order).toEqual(["a", "b"]);\n')
    ).toEqual([]);
    expect(
      findWallClockAssertions(
        '// wall-clock-ok: asserting the injected clock\nexpect(elapsedMs).toBeLessThan(5);\n'
      )
    ).toEqual([]);
  });
});

describe('gating tests carry no new wall-clock assertions (JOV-10086)', () => {
  const found = scanRepo(REPO_ROOT);

  it('adds none beyond the ratchet baseline', () => {
    const added = Object.entries(found)
      .filter(([file, count]) => count > (baseline[file] ?? 0))
      .map(
        ([file, count]) => `${file}: ${count} (baseline ${baseline[file] ?? 0})`
      );
    expect(
      added,
      'New wall-clock assertion in a gating test. Use an injected clock or ' +
        'assert order/state; put a real perf budget in a *.perf.test.* file; ' +
        'or add `// wall-clock-ok: <reason>` for a false positive.'
    ).toEqual([]);
  });

  it('keeps the baseline tight so it only ratchets down', () => {
    const stale = Object.entries(baseline)
      .filter(([file, count]) => (found[file] ?? 0) < count)
      .map(([file]) => file);
    expect(
      stale,
      'Lower or delete these entries in scripts/lib/wall-clock-assertion-baseline.json'
    ).toEqual([]);
  });
});
