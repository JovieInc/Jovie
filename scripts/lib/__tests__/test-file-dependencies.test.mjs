import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  directDependencies,
  testDependencies,
  testsAffectedBy,
} from '../test-file-dependencies.mjs';

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'test-deps-'));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
}

test('follows imports and file reads, by URL or by repo path', () => {
  const root = fixture({
    'scripts/a/a.test.mjs': [
      "import { x } from './lib.mjs';",
      "readFileSync(new URL('../../apps/web/constants.ts', import.meta.url));",
      "readFileSync(join(ROOT, 'docs/guide.md'));",
      "const ignored = 'scripts/a/missing.mjs';",
    ].join('\n'),
    'scripts/a/lib.mjs': "export * from '../b/deep.mjs'; const n = 'node:fs';",
    'scripts/b/deep.mjs': "import('./leaf.cjs');",
    'scripts/b/leaf.cjs': "require('./never.cjs');",
    'apps/web/constants.ts': 'export const T = 1;',
    'docs/guide.md': '# guide',
  });
  try {
    assert.deepEqual(
      [...testDependencies('scripts/a/a.test.mjs', root)].sort(),
      [
        'apps/web/constants.ts',
        'docs/guide.md',
        'scripts/a/a.test.mjs',
        'scripts/a/lib.mjs',
        'scripts/b/deep.mjs',
        'scripts/b/leaf.cjs',
      ]
    );
    assert.deepEqual(
      [...directDependencies('scripts/a/lib.mjs', root)],
      ['scripts/b/deep.mjs']
    );
    assert.deepEqual(
      testsAffectedBy(
        ['scripts/a/a.test.mjs', 'scripts/b/other.test.mjs'],
        ['apps/web/constants.ts'],
        root
      ),
      ['scripts/a/a.test.mjs']
    );
    assert.deepEqual(testsAffectedBy(['scripts/a/a.test.mjs'], [], root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the funnel rubric contract depends on the lead DM template (#20922)', () => {
  assert.ok(
    testDependencies('scripts/funnel-judge/rubric.test.mjs', process.cwd()).has(
      'apps/web/lib/leads/constants.ts'
    )
  );
});
