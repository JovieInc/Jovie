import assert from 'node:assert/strict';
import fs, { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
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

test('a quoted root file and a same-directory ./file match without a deeper slash', () => {
  const root = fixture({
    'DESIGN.md': '# design',
    'scripts/agent-context/design-sections.json': '{}\n',
    'scripts/agent-context/helper.mjs': 'export {};\n',
    'scripts/agent-context/check.test.mjs': [
      "readFileSync(resolve(root, 'DESIGN.md'), 'utf8');",
      "readFileSync(new URL('./design-sections.json', import.meta.url), 'utf8');",
      "const mentioned = 'helper.mjs';",
      "const skipped = 'NOT-A-FILE.md';",
    ].join('\n'),
  });
  try {
    assert.deepEqual(
      [
        ...testDependencies('scripts/agent-context/check.test.mjs', root),
      ].sort(),
      [
        'DESIGN.md',
        'scripts/agent-context/check.test.mjs',
        'scripts/agent-context/design-sections.json',
      ]
    );
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

test('one selection parses shared cyclic imports once and preserves grouped input order', t => {
  const root = fixture({
    'scripts/a.test.mjs': "import './shared.mjs';",
    'scripts/b.test.mjs': "import './shared.mjs';",
    'scripts/shared.mjs':
      "import './cycle.mjs'; readFileSync('docs/guide.md');",
    'scripts/cycle.mjs': "import './shared.mjs';",
    'docs/guide.md': '# guide',
  });
  let sharedReads = 0;
  const read = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', (file, options) => {
    if (String(file) === join(root, 'scripts/shared.mjs')) sharedReads++;
    return read(file, options);
  });
  syncBuiltinESMExports();
  try {
    const tests = [
      'scripts/b.test.mjs scripts/missing.test.mjs',
      'scripts/a.test.mjs',
      'scripts/b.test.mjs',
    ];
    assert.deepEqual(testsAffectedBy(tests, ['docs/guide.md'], root), tests);
    assert.equal(sharedReads, 1);
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    rmSync(root, { recursive: true, force: true });
  }
});

test('separate selections reread changed modules and newly created or removed input files', () => {
  const root = fixture({
    'scripts/a.test.mjs': "import './shared.mjs';",
    'scripts/shared.mjs': "readFileSync('docs/old.md');",
    'docs/old.md': '# old',
    'docs/new.md': '# new',
  });
  const tests = ['scripts/a.test.mjs'];
  try {
    assert.deepEqual(testsAffectedBy(tests, ['docs/old.md'], root), tests);
    writeFileSync(
      join(root, 'scripts/shared.mjs'),
      "readFileSync('docs/new.md'); readFileSync('docs/later.md');"
    );
    assert.deepEqual(testsAffectedBy(tests, ['docs/old.md'], root), []);
    assert.deepEqual(testsAffectedBy(tests, ['docs/new.md'], root), tests);
    assert.ok(!testDependencies(tests[0], root).has('docs/later.md'));
    writeFileSync(join(root, 'docs/later.md'), '# later');
    assert.deepEqual(testsAffectedBy(tests, ['docs/later.md'], root), tests);
    rmSync(join(root, 'docs/later.md'));
    assert.deepEqual(testsAffectedBy(tests, ['docs/later.md'], root), []);
    assert.ok(!testDependencies(tests[0], root).has('docs/later.md'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
