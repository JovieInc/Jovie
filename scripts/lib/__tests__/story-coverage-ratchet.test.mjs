import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  compareCoverage,
  listAtomComponents,
  measureStoryCoverage,
  validateBaseline,
} from '../../story-coverage-ratchet.mjs';

const temps = [];

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function fixtureAtoms(files) {
  const dir = mkdtempSync(join(tmpdir(), 'story-cov-'));
  temps.push(dir);
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, name), body ?? 'export const X = () => null;\n');
  }
  return dir;
}

describe('story-coverage-ratchet', () => {
  it('lists only public atoms and matches stories case-insensitively', () => {
    const dir = fixtureAtoms({
      'button.tsx': '',
      'button.stories.tsx': '',
      'card.tsx': '',
      'Card.stories.tsx': '',
      'input.tsx': '',
      'input.test.tsx': '',
      'common-dropdown-utils.ts': '',
      index.ts: '',
    });
    // .ts helpers excluded by SOURCE_RE (.tsx only); index excluded
    const list = listAtomComponents(dir);
    expect(list.map(c => c.component).sort()).toEqual([
      'button',
      'card',
      'input',
    ]);
    expect(list.find(c => c.component === 'button')?.covered).toBe(true);
    expect(list.find(c => c.component === 'card')?.covered).toBe(true);
    expect(list.find(c => c.component === 'input')?.covered).toBe(false);
  });

  it('measures coverage percent', () => {
    const dir = fixtureAtoms({
      'a.tsx': '',
      'a.stories.tsx': '',
      'b.tsx': '',
    });
    const m = measureStoryCoverage(dir);
    expect(m.total).toBe(2);
    expect(m.covered).toBe(1);
    expect(m.percent).toBe(50);
    expect(m.uncoveredComponents).toEqual(['b']);
  });

  it('ratchets lock_up: pass when at/above baseline, fail when below', () => {
    const baseline = {
      schemaVersion: 1,
      percent: 50,
      covered: 1,
      total: 2,
    };
    expect(validateBaseline(baseline).ok).toBe(true);
    expect(
      compareCoverage({ percent: 50, covered: 1, total: 2, uncoveredComponents: [] }, baseline)
        .ok
    ).toBe(true);
    expect(
      compareCoverage({ percent: 75, covered: 3, total: 4, uncoveredComponents: [] }, baseline)
        .ok
    ).toBe(true);
    expect(
      compareCoverage({ percent: 40, covered: 2, total: 5, uncoveredComponents: ['x'] }, baseline)
        .ok
    ).toBe(false);
  });

  it('rejects invalid baseline', () => {
    expect(validateBaseline({ schemaVersion: 2, percent: 10, covered: 1, total: 1 }).ok).toBe(
      false
    );
  });
});
