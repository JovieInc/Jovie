import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
  normalizeRepoWebPath,
  readMutationHeatmapScores,
  scoresFromMutationBaseline,
  scoresFromStrykerReport,
} from '../mutation-heatmap-scores.mjs';

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'mut-heatmap-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (rel, value) => {
    const dest = join(root, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(
      dest,
      typeof value === 'string' ? value : JSON.stringify(value, null, 2)
    );
  };
  return { root, write };
}

test('normalizeRepoWebPath accepts web-relative, repo-relative, and abs paths', () => {
  assert.equal(normalizeRepoWebPath('proxy.ts'), 'apps/web/proxy.ts');
  assert.equal(
    normalizeRepoWebPath('apps/web/lib/stripe/dunning.ts'),
    'apps/web/lib/stripe/dunning.ts'
  );
  assert.equal(
    normalizeRepoWebPath('/workspace/checkout/apps/web/lib/auth/x.ts'),
    'apps/web/lib/auth/x.ts'
  );
});

test('scoresFromMutationBaseline maps measured floors to apps/web paths', t => {
  const { root, write } = fixture(t);
  write('baseline.json', {
    schemaVersion: 1,
    direction: 'lock_up',
    files: {
      'proxy.ts': { measured: 56.7, floor: 55.7, valid: 150 },
      'lib/stripe/dunning.ts': { measured: 12.6, floor: 11.6, valid: 135 },
    },
  });
  assert.deepEqual(scoresFromMutationBaseline(join(root, 'baseline.json')), {
    'apps/web/proxy.ts': 57,
    'apps/web/lib/stripe/dunning.ts': 13,
  });
});

test('scoresFromStrykerReport derives kill ratio per file', t => {
  const { root, write } = fixture(t);
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
  assert.deepEqual(scoresFromStrykerReport(join(root, 'stryker.json')), {
    'apps/web/proxy.ts': 67,
  });
});

test('readMutationHeatmapScores prefers live Stryker over baseline', t => {
  const { root, write } = fixture(t);
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
  assert.deepEqual(
    readMutationHeatmapScores({
      repoRoot: root,
      baselinePath: join(root, 'baseline.json'),
      strykerPath: join(root, 'stryker.json'),
    }),
    {
      'apps/web/proxy.ts': 100,
      'apps/web/lib/stripe/dunning.ts': 13,
    }
  );
});

test('readMutationHeatmapScores falls back to baseline alone', t => {
  const { root, write } = fixture(t);
  write('baseline.json', {
    files: { 'proxy.ts': { measured: 56.7 } },
  });
  assert.deepEqual(
    readMutationHeatmapScores({
      repoRoot: root,
      baselinePath: join(root, 'baseline.json'),
      strykerPath: join(root, 'missing-stryker.json'),
    }),
    { 'apps/web/proxy.ts': 57 }
  );
});
