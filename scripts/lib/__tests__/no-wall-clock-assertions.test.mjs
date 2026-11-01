import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  findWallClockAssertions,
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
