import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  normalizeRepoWebPath,
  readMutationHeatmapScores,
  scoresFromMutationBaseline,
  scoresFromStrykerReport,
} from '../mutation-heatmap-scores.mjs';

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'mut-heatmap-')));
  const write = (rel, value) => {
    const dest = join(root, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(
      dest,
      typeof value === 'string' ? value : JSON.stringify(value, null, 2)
    );
  };
  return {
    root,
    write,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

describe('mutation-heatmap-scores', () => {
  /** @type {Array<() => void>} */
  const cleanups = [];
  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
  });

  it('normalizeRepoWebPath accepts web-relative, repo-relative, and abs paths', () => {
    expect(normalizeRepoWebPath('proxy.ts')).toBe('apps/web/proxy.ts');
    expect(normalizeRepoWebPath('apps/web/lib/stripe/dunning.ts')).toBe(
      'apps/web/lib/stripe/dunning.ts'
    );
    expect(
      normalizeRepoWebPath('/workspace/checkout/apps/web/lib/auth/x.ts')
    ).toBe('apps/web/lib/auth/x.ts');
  });

  it('scoresFromMutationBaseline maps measured floors to apps/web paths', () => {
    const { root, write, cleanup } = fixture();
    cleanups.push(cleanup);
    write('baseline.json', {
      schemaVersion: 1,
      direction: 'lock_up',
      files: {
        'proxy.ts': { measured: 56.7, floor: 55.7, valid: 150 },
        'lib/stripe/dunning.ts': { measured: 12.6, floor: 11.6, valid: 135 },
      },
    });
    expect(scoresFromMutationBaseline(join(root, 'baseline.json'))).toEqual({
      'apps/web/proxy.ts': 57,
      'apps/web/lib/stripe/dunning.ts': 13,
    });
  });

  it('scoresFromStrykerReport uses canonical scoreMutants kill ratio', () => {
    const { root, write, cleanup } = fixture();
    cleanups.push(cleanup);
    write('stryker.json', {
      files: {
        'apps/web/proxy.ts': {
          mutants: [
            { status: 'Killed' },
            { status: 'Killed' },
            { status: 'Survived' },
          ],
        },
      },
    });
    expect(scoresFromStrykerReport(join(root, 'stryker.json'))).toEqual({
      'apps/web/proxy.ts': 66.7,
    });
  });

  it('scoresFromStrykerReport excludes CompileError from the denominator', () => {
    const { root, write, cleanup } = fixture();
    cleanups.push(cleanup);
    write('stryker.json', {
      files: {
        'apps/web/proxy.ts': {
          mutants: [{ status: 'Killed' }, { status: 'CompileError' }],
        },
      },
    });
    expect(scoresFromStrykerReport(join(root, 'stryker.json'))).toEqual({
      'apps/web/proxy.ts': 100,
    });
  });

  it('scoresFromStrykerReport withholds incomplete statuses so baseline can fill', () => {
    const { root, write, cleanup } = fixture();
    cleanups.push(cleanup);
    write('baseline.json', {
      files: { 'proxy.ts': { measured: 56.7 } },
    });
    write('stryker.json', {
      files: {
        'apps/web/proxy.ts': {
          mutants: [{ status: 'Killed' }, { status: 'Timeout' }],
        },
        'apps/web/lib/stripe/dunning.ts': {
          mutants: [{ status: 'Killed' }, { status: 'Survived' }],
        },
      },
    });
    expect(
      readMutationHeatmapScores({
        repoRoot: root,
        baselinePath: join(root, 'baseline.json'),
        strykerPath: join(root, 'stryker.json'),
      })
    ).toEqual({
      'apps/web/proxy.ts': 57,
      'apps/web/lib/stripe/dunning.ts': 50,
    });
  });

  it('readMutationHeatmapScores prefers live Stryker over baseline', () => {
    const { root, write, cleanup } = fixture();
    cleanups.push(cleanup);
    write('baseline.json', {
      files: {
        'proxy.ts': { measured: 50 },
        'lib/stripe/dunning.ts': { measured: 12.6 },
      },
    });
    write('stryker.json', {
      files: {
        'apps/web/proxy.ts': {
          mutants: [{ status: 'Killed' }, { status: 'Killed' }],
        },
      },
    });
    expect(
      readMutationHeatmapScores({
        repoRoot: root,
        baselinePath: join(root, 'baseline.json'),
        strykerPath: join(root, 'stryker.json'),
      })
    ).toEqual({
      'apps/web/proxy.ts': 100,
      'apps/web/lib/stripe/dunning.ts': 13,
    });
  });

  it('readMutationHeatmapScores falls back to baseline alone', () => {
    const { root, write, cleanup } = fixture();
    cleanups.push(cleanup);
    write('baseline.json', {
      files: { 'proxy.ts': { measured: 56.7 } },
    });
    expect(
      readMutationHeatmapScores({
        repoRoot: root,
        baselinePath: join(root, 'baseline.json'),
        strykerPath: join(root, 'missing-stryker.json'),
      })
    ).toEqual({ 'apps/web/proxy.ts': 57 });
  });
});
