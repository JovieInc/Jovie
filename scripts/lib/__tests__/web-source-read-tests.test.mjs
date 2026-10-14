import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
  keyMatches,
  pathKeys,
  selectSourceReadTests,
  sourceReadTests,
} from '../web-source-read-tests.mjs';

const ROOT = join(import.meta.dirname, '../../..');

test('path keys keep path literals, join runs, file names and route groups', () => {
  const keys = pathKeys(`
    import { readFileSync } from 'node:fs';
    const SHELL_ROOT = path.join(WEB_ROOT, 'app', 'app', '(shell)');
    const css = readFileSync(join(WEB_ROOT, 'styles', 'tailwind-foundation.css'));
    const specs = globSync('tests/e2e/storybook-*.spec.ts');
    const budgets = '../../scripts/route-js-budgets.json';
    const alias = '@/components/organisms/Sidebar';
  `);
  for (const key of [
    'app/app/(shell)',
    'styles/tailwind-foundation.css',
    'tests/e2e/storybook-*.spec.ts',
    'scripts/route-js-budgets.json',
    'components/organisms/Sidebar',
    '(shell)',
  ])
    assert.ok(keys.has(key), key);
  // Bare words, workspace roots and match-all globs name everything.
  for (const key of [
    'app',
    'node:fs',
    'apps/web',
    'apps/web/**',
    '**/*',
    '*/*',
  ])
    assert.ok(!keys.has(key), key);
  assert.ok(!pathKeys("const root = 'apps/web';").has('apps/web'));
  assert.ok(!pathKeys("globSync('**/*')").size);
});

test('keys match changed paths on whole segments, web-relative or repo-relative', () => {
  const page = 'apps/web/app/app/(shell)/admin/inbox/page.tsx';
  assert.ok(keyMatches('app/app/(shell)', page));
  assert.ok(keyMatches('apps/web/app', page));
  assert.ok(keyMatches('(shell)', page));
  assert.ok(keyMatches('page.tsx', page));
  assert.ok(!keyMatches('app/app/(sh', page));
  assert.ok(!keyMatches('apps/web/application', page));
  assert.ok(
    keyMatches(
      'tests/e2e/storybook-*.spec.ts',
      'apps/web/tests/e2e/storybook-new-surface.spec.ts'
    )
  );
  assert.ok(
    !keyMatches(
      'tests/e2e/storybook-*.spec.ts',
      'apps/web/tests/e2e/nested/storybook-x.spec.ts'
    )
  );
  assert.ok(
    keyMatches(
      'components/organisms/Sidebar',
      'apps/web/components/organisms/Sidebar.tsx'
    )
  );
  assert.ok(
    !keyMatches(
      'components/organisms/Sidebar',
      'apps/web/components/organisms/SidebarRail.tsx'
    )
  );
  assert.ok(keyMatches('.github/workflows/ci.yml', '.github/workflows/ci.yml'));
});

test('selects only disk-reading tests whose keys name a changed path', () => {
  const root = mkdtempSync(join(tmpdir(), 'web-source-read-'));
  const write = (path, body) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  };
  try {
    write(
      'apps/web/tests/unit/routes/shell-nav.test.ts',
      "import fs from 'node:fs';\nconst dir = join(ROOT, 'app', 'app', '(shell)');\n"
    );
    write(
      'apps/web/tests/unit/imports-only.test.ts',
      "import { Shell } from '@/app/app/(shell)/layout';\n"
    );
    write(
      'apps/web/tests/unit/css.test.ts',
      "import { readFileSync } from 'node:fs';\nreadFileSync(join(R, 'styles', 'base.css'));\n"
    );
    write(
      'apps/web/tests/unit/ci/browser.test.ts',
      "import { readFileSync } from 'node:fs';\nreadFileSync('.github/workflows/ci.yml');\nspawnSync('pnpm', ['exec', 'playwright', 'test']);\n"
    );
    write(
      'apps/web/tests/unit/ci/chromium.test.ts',
      "import fs from 'node:fs';\nfs.readFileSync('.github/workflows/ci.yml');\nawait chromium.launch();\n"
    );
    // Browser-launching tests need installed browsers; the shards run them.
    assert.deepEqual(sourceReadTests(root), [
      'apps/web/tests/unit/css.test.ts',
      'apps/web/tests/unit/routes/shell-nav.test.ts',
    ]);
    assert.deepEqual(
      selectSourceReadTests(['apps/web/app/app/(shell)/admin/inbox/page.tsx'], {
        root,
      }),
      ['apps/web/tests/unit/routes/shell-nav.test.ts']
    );
    assert.deepEqual(
      selectSourceReadTests(['apps/web/tests/unit/css.test.ts'], { root }),
      ['apps/web/tests/unit/css.test.ts']
    );
    assert.deepEqual(
      selectSourceReadTests(['apps/ios/Jovie/App.swift'], { root }),
      []
    );
    assert.deepEqual(selectSourceReadTests([], { root }), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Guards that ejected merge groups after a green PR CI (7 days to 10-12),
// with the path the culprit PR changed.
test('selects the guards that escaped PR CI for the paths that broke them', () => {
  const tests = sourceReadTests(ROOT);
  for (const [guard, changed] of [
    [
      'apps/web/tests/unit/routes/shell-nav-coverage.test.ts',
      'apps/web/app/app/(shell)/admin/inbox/page.tsx',
    ],
    [
      'apps/web/tests/unit/e2e/storybook-attachment-names.test.ts',
      'apps/web/tests/e2e/storybook-new-surface.spec.ts',
    ],
    [
      'apps/web/tests/unit/design-system/ambiguous-text-base.test.ts',
      'apps/web/styles/tailwind-foundation.css',
    ],
    [
      'apps/web/tests/unit/design-system/app-screen-canvas-manifest.test.ts',
      'apps/web/components/organisms/NewPanel.tsx',
    ],
  ])
    assert.ok(
      selectSourceReadTests([changed], { root: ROOT, tests }).includes(guard),
      `${guard} <- ${changed}`
    );
});

test('the CLI lists the selection from the checkout it runs in', () => {
  const result = spawnSync(
    process.execPath,
    [
      join(ROOT, 'scripts/lib/web-source-read-tests.mjs'),
      '--list',
      'apps/web/app/app/(shell)/admin/inbox/page.tsx',
    ],
    { cwd: ROOT, encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /disk-reading web test\(s\) name a changed path/);
  assert.match(
    result.stdout,
    /^tests\/unit\/routes\/shell-nav-coverage\.test\.ts$/m
  );
});

test('never selects browser-launching tests, even for a workflow they read', () => {
  const selected = selectSourceReadTests(['.github/workflows/ci.yml'], {
    root: ROOT,
  });
  assert.ok(
    !selected.includes(
      'apps/web/tests/unit/ci/playwright-artifact-secrets.test.ts'
    )
  );
  assert.ok(
    !sourceReadTests(ROOT).includes(
      'apps/web/tests/unit/ci/playwright-artifact-secrets.test.ts'
    )
  );
});
