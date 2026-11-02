import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildPreflightEnv,
  deriveSteps,
  JOB_ID,
  lintBody,
  main,
  prepareStatement,
  splitStatements,
  substitute,
  WORKFLOW_PATH,
} from './preflight.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function lintRepairDiff(
  before,
  after,
  filename = 'feedback.test.ts',
  marker = '<!-- customer-changelog/v1 {"releaseWorthy":false} -->'
) {
  const cwd = mkdtempSync(path.join(tmpdir(), 'pf-body-'));
  const env = buildPreflightEnv();
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  };
  try {
    git('init', '-q', '-b', 'main');
    git('config', 'user.name', 'Preflight fixture');
    git('config', 'user.email', 'fixture@example.com');
    mkdirSync(path.dirname(path.join(cwd, filename)), { recursive: true });
    writeFileSync(path.join(cwd, filename), before);
    git('add', '.');
    git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'base');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    writeFileSync(path.join(cwd, filename), after);
    git('add', '.');
    git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'repair');
    const bodyFile = path.join(cwd, 'body.md');
    writeFileSync(
      bodyFile,
      `${marker}\n` +
        '## Red-before-green\n- Failing command: node --test feedback.test.ts\n' +
        '```text\nFAIL feedback regression\n```\n'
    );
    return await lintBody({
      bodyFile,
      title: 'fix: feedback',
      base: 'main',
      cwd,
      env,
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test('body preflight rejects a repair that only weakens an assertion', async () => {
  const result = await lintRepairDiff(
    'expect(feedback).toBe("Copied!");\n',
    'expect(feedback).toBeTruthy();\n'
  );
  assert.ok(result.errors.some(error => error.startsWith('assertions:')));
});

test('body preflight accepts a specific regression assertion and canonical JSON marker', async () => {
  const result = await lintRepairDiff(
    'expect(feedback).toBeTruthy();\n',
    'expect(feedback).toBe("Copied!");\n'
  );
  assert.deepEqual(result.errors, []);
});

test('body preflight applies the hosted customer-note contract to changed UI', async () => {
  const result = await lintRepairDiff(
    'export const feedback = "Copy";\n',
    'export const feedback = "Copied!";\n',
    'apps/web/components/features/feedback.tsx'
  );
  assert.deepEqual(result.errors, []);
});

test('body preflight rejects a malformed customer-note marker on changed UI', async () => {
  const result = await lintRepairDiff(
    'export const feedback = "Copy";\n',
    'export const feedback = "Copied!";\n',
    'apps/web/components/features/feedback.tsx',
    '<!-- customer-changelog/v1 {"releaseWorthy":"false"} -->'
  );
  assert.ok(result.errors.some(error => error.startsWith('changelog-marker:')));
});

const workflow = extra => `
name: fixture
jobs:
  ${JOB_ID}:
    steps:
      - uses: actions/checkout@v1
      - name: Contract
        env:
          BASE: \${{ github.base_ref }}
        run: |
          set -euo pipefail
          # a comment
          echo first-ok
          false
          echo "second ran \${BASE}"
          node -e '
            process.exit(3)
          '
          test 1 -eq 2 || exit 7
          echo last-ok
${extra}
`;

async function runPlan(text) {
  const dir = mkdtempSync(path.join(tmpdir(), 'pf-test-'));
  mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
  writeFileSync(path.join(dir, WORKFLOW_PATH), text);
  const lines = [];
  const code = await main({
    argv: ['--workflow', path.join(dir, WORKFLOW_PATH)],
    env: { JOVIE_PREFLIGHT_LEDGER: 'off', PATH: process.env.PATH },
    log: line => lines.push(line),
    cwd: dir,
  });
  return { code, out: lines.join('\n') };
}

test('splitStatements keeps multi-line quotes together and drops comments', () => {
  const statements = splitStatements(
    "# c\necho a\nnode -e '\n  1\n'\nfoo \\\n  bar\n"
  );
  assert.equal(statements.length, 3);
  assert.match(statements[1], /^node -e/);
});

test('set -e is neutralised and || exit is contained', () => {
  assert.equal(prepareStatement('set -euo pipefail'), 'set -uo pipefail');
  assert.match(prepareStatement('test 1 -eq 2 || exit 7'), /^\( test/);
  assert.match(prepareStatement('if x; then\n exit 0\nfi'), /^\( if/);
  assert.equal(
    prepareStatement('pnpm --filter web typecheck', {
      flockPath: '/tmp/l',
      typecheckGate: 'host-admit typecheck --',
    }),
    'host-admit typecheck -- pnpm --filter web typecheck'
  );
  assert.equal(
    prepareStatement('pnpm typecheck', { flockPath: '/tmp/l' }),
    'flock /tmp/l pnpm typecheck'
  );
});

test('local history fetch preserves shallow-clone flags and fetch failures', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pf-fetch-'));
  const argsFile = path.join(dir, 'fetch-args');
  writeFileSync(
    path.join(dir, 'git'),
    `#!/bin/bash
if [ "$1" = rev-parse ]; then echo "$PREFLIGHT_SHALLOW"; exit 0; fi
printf '%s\\n' "$@" > "$PREFLIGHT_FETCH_ARGS"
if [ "$PREFLIGHT_SHALLOW" = false ] && [[ " $* " == *" --unshallow "* ]]; then exit 128; fi
exit "$PREFLIGHT_FETCH_STATUS"
`,
    { mode: 0o700 }
  );
  try {
    for (const [shallow, fetchStatus] of [
      ['false', 0],
      ['true', 0],
      ['false', 43],
    ]) {
      const result = spawnSync(
        'bash',
        [
          '-c',
          prepareStatement(
            'git fetch --no-tags --unshallow --filter=blob:none origin main'
          ),
        ],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${dir}:${process.env.PATH}`,
            PREFLIGHT_SHALLOW: String(shallow),
            PREFLIGHT_FETCH_STATUS: String(fetchStatus),
            PREFLIGHT_FETCH_ARGS: argsFile,
          },
        }
      );
      assert.equal(result.status, fetchStatus, result.stderr);
      const args = readFileSync(argsFile, 'utf8').trim().split('\n');
      assert.equal(args.includes('--unshallow'), shallow === 'true');
      assert.deepEqual(
        args.filter(arg => arg !== '--unshallow'),
        ['fetch', '--no-tags', '--filter=blob:none', 'origin', 'main']
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('substitute reports expressions with no local value', () => {
  const { text, unresolved } = substitute('a ${{ x.y }} ${{ k }}', { k: 'v' });
  assert.equal(text, 'a  v');
  assert.deepEqual(unresolved, ['x.y']);
});

test('lists every failing statement in one pass, not just the first', async () => {
  const { code, out } = await runPlan(workflow(''));
  assert.equal(code, 1);
  assert.match(out, /FAIL \(1\)  false/);
  assert.match(out, /FAIL \(3\)  node -e/);
  assert.match(out, /FAIL \(7\)  test 1 -eq 2 \|\| exit 7/);
  assert.match(out, /3 item\(s\) to fix/);
});

test('a step added to the workflow appears in the derived plan and runs', async () => {
  const added = `      - name: Brand new gate
        run: node -e "process.exit(9)"`;
  assert.ok(
    deriveSteps(workflow(added)).some(step => step.name === 'Brand new gate')
  );
  const { out } = await runPlan(workflow(added));
  assert.match(out, /== Brand new gate/);
  assert.match(out, /FAIL \(9\)/);
});

test('every step is either planned to run or skipped with a written reason', () => {
  const steps = deriveSteps(
    readFileSync(path.join(ROOT, WORKFLOW_PATH), 'utf8')
  );
  for (const step of steps) {
    assert.ok(
      step.skip ? step.skip.length > 3 : step.run.trim().length > 0,
      `${step.name}: neither runnable nor skipped with a reason`
    );
  }
});

test('the real Source Validation workflow yields the gates workers keep missing', () => {
  const steps = deriveSteps(
    readFileSync(path.join(ROOT, WORKFLOW_PATH), 'utf8')
  );
  const runnable = steps
    .filter(step => !step.skip)
    .map(step => step.run)
    .join('\n');
  for (const gate of [
    'component-ship-gate',
    'screen-registration-gate',
    'lint:eslint:changed',
    'pnpm typecheck',
  ])
    assert.ok(runnable.includes(gate), `${gate} missing from derived plan`);
});

test('no derived step writes a fixed shared /tmp path', () => {
  const steps = deriveSteps(
    readFileSync(path.join(ROOT, WORKFLOW_PATH), 'utf8')
  );
  for (const step of steps)
    assert.doesNotMatch(
      step.run,
      /(?<![\w$}/])\/tmp\/[\w.-]/,
      `${step.name} uses a fixed /tmp path; use mktemp or RUNNER_TEMP`
    );
});

test('pre-push Git environment cannot redirect fixture writes into its linked worktree', () => {
  // Fixture setup must be isolated even when this test itself runs in a hook.
  const localNames = spawnSync('git', ['rev-parse', '--local-env-vars'], {
    encoding: 'utf8',
  });
  assert.equal(localNames.status, 0, localNames.stderr);
  const fixtureEnv = { ...process.env };
  for (const name of localNames.stdout.trim().split('\n'))
    delete fixtureEnv[name];
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'pf-git-env-')));
  const parent = path.join(root, 'parent');
  const linked = path.join(root, 'linked');
  const fixtures = path.join(root, 'fixtures');
  const git = (cwd, ...args) => {
    const result = spawnSync('git', args, {
      cwd,
      env: fixtureEnv,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
    return result.stdout.trim();
  };
  try {
    git(root, 'init', '-q', '-b', 'main', parent);
    git(parent, 'config', 'user.name', 'Preflight parent owner');
    git(parent, 'config', 'user.email', 'parent@example.com');
    mkdirSync(path.join(parent, 'scripts'), { recursive: true });
    mkdirSync(path.join(parent, '.github', 'workflows'), { recursive: true });
    copyFileSync(
      path.join(ROOT, 'scripts/preflight.mjs'),
      path.join(parent, 'scripts/preflight.mjs')
    );
    writeFileSync(path.join(parent, 'tracked.txt'), 'parent content\n');
    writeFileSync(
      path.join(parent, WORKFLOW_PATH),
      `
jobs:
  ${JOB_ID}:
    steps:
      - name: Isolated repository fixtures
        run: |
          test "$PREFLIGHT_KEEP" = "retained"
          test "$GIT_TRACE" = "0"
          mkdir -p "$PREFLIGHT_FIXTURES/bare.git" "$PREFLIGHT_FIXTURES/child"
          git init -q --bare "$PREFLIGHT_FIXTURES/bare.git"
          git -C "$PREFLIGHT_FIXTURES/bare.git" config user.name "Child fixture"
          git init -q "$PREFLIGHT_FIXTURES/child"
          printf 'child content\\n' > "$PREFLIGHT_FIXTURES/child/child.txt"
          git -C "$PREFLIGHT_FIXTURES/child" add -A
          git -C "$PREFLIGHT_FIXTURES/child" -c commit.gpgsign=false -c user.name=Child -c user.email=child@example.com commit -qm fixture
          git -C "$PREFLIGHT_FIXTURES/child" rev-parse --absolute-git-dir > "$PREFLIGHT_FIXTURES/child-git-dir"
`
    );
    git(parent, 'add', '.');
    git(parent, '-c', 'commit.gpgsign=false', 'commit', '-qm', 'initial');
    git(parent, 'worktree', 'add', '-q', '-b', 'hook-worktree', linked);
    symlinkSync(
      path.join(ROOT, 'node_modules'),
      path.join(linked, 'node_modules'),
      'dir'
    );
    writeFileSync(path.join(linked, 'staged.txt'), 'keep this staging\n');
    git(linked, 'add', 'staged.txt');
    writeFileSync(
      path.join(linked, 'tracked.txt'),
      'keep this unstaged edit\n'
    );
    const linkedGitDir = git(linked, 'rev-parse', '--absolute-git-dir');
    const commonConfig = path.join(parent, '.git', 'config');
    const hashFile = filename =>
      createHash('sha256').update(readFileSync(filename)).digest('hex');
    const snapshot = () => ({
      config: readFileSync(commonConfig, 'utf8'),
      parentHead: readFileSync(
        path.join(parent, '.git', 'refs', 'heads', 'main'),
        'utf8'
      ),
      linkedHead: readFileSync(
        path.join(parent, '.git', 'refs', 'heads', 'hook-worktree'),
        'utf8'
      ),
      parentIndex: hashFile(path.join(parent, '.git', 'index')),
      linkedIndex: hashFile(path.join(linkedGitDir, 'index')),
      worktreeContent: readFileSync(path.join(linked, 'tracked.txt'), 'utf8'),
    });
    const before = snapshot();
    const result = spawnSync(
      process.execPath,
      ['scripts/preflight.mjs', '--hook'],
      {
        cwd: linked,
        env: {
          ...fixtureEnv,
          GIT_DIR: linkedGitDir,
          GIT_COMMON_DIR: path.join(parent, '.git'),
          GIT_WORK_TREE: linked,
          GIT_INDEX_FILE: path.join(linkedGitDir, 'index'),
          GIT_TRACE: '0',
          PREFLIGHT_KEEP: 'retained',
          PREFLIGHT_FIXTURES: fixtures,
          JOVIE_PREFLIGHT_LEDGER: 'off',
          JOVIE_PREFLIGHT: '1',
        },
        encoding: 'utf8',
        timeout: 30000,
      }
    );
    assert.deepEqual(
      snapshot(),
      before,
      'preflight changed its caller repository'
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /== Isolated repository fixtures/);
    assert.equal(git(parent, 'rev-parse', '--is-bare-repository'), 'false');
    assert.equal(
      git(path.join(fixtures, 'bare.git'), 'rev-parse', '--is-bare-repository'),
      'true'
    );
    assert.equal(
      git(path.join(fixtures, 'bare.git'), 'config', 'user.name'),
      'Child fixture'
    );
    assert.equal(
      readFileSync(path.join(fixtures, 'child-git-dir'), 'utf8').trim(),
      path.join(fixtures, 'child', '.git')
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('child environment removes only Git-local variables and does not mutate its caller', () => {
  const source = {
    PATH: process.env.PATH,
    GIT_DIR: '/not-the-fixture',
    GIT_WORK_TREE: '/not-the-fixture',
    GIT_INDEX_FILE: '/not-the-fixture/index',
    GIT_COMMON_DIR: '/not-the-fixture/common',
    GIT_CONFIG_COUNT: '0',
    GIT_PREFIX: 'hook/',
    GIT_TRACE: '0',
    GIT_SSH_COMMAND: 'ssh -o BatchMode=yes',
    GIT_AUTHOR_NAME: 'Original author',
    PREFLIGHT_KEEP: 'retained',
  };
  const before = { ...source };
  assert.deepEqual(buildPreflightEnv(source), {
    PATH: source.PATH,
    GIT_TRACE: '0',
    GIT_SSH_COMMAND: 'ssh -o BatchMode=yes',
    GIT_AUTHOR_NAME: 'Original author',
    PREFLIGHT_KEEP: 'retained',
  });
  assert.deepEqual(source, before);
});

test('preflight fails closed when Git cannot identify its local environment', () => {
  assert.throws(
    () => buildPreflightEnv({ PATH: '/preflight-fixture-without-git' }),
    /Could not identify Git repository-local environment variables/
  );
});

function copiedCliFixture() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'pf-entry-')));
  const real = path.join(root, 'real');
  const alias = path.join(root, 'alias');
  mkdirSync(path.join(real, 'scripts'), { recursive: true });
  copyFileSync(
    path.join(ROOT, 'scripts/preflight.mjs'),
    path.join(real, 'scripts/preflight.mjs')
  );
  symlinkSync(
    path.join(ROOT, 'node_modules'),
    path.join(real, 'node_modules'),
    'dir'
  );
  symlinkSync(real, alias, 'dir');
  return { root, real, alias };
}

test('a symlinked preflight entrypoint still runs a nonzero gate', () => {
  const { root, real, alias } = copiedCliFixture();
  try {
    writeFileSync(
      path.join(real, 'fixture.yml'),
      `
jobs:
  ${JOB_ID}:
    steps:
      - name: Deliberate failing gate
        run: node -e 'process.exit(23)'
`
    );
    const result = spawnSync(
      process.execPath,
      [
        path.join(alias, 'scripts/preflight.mjs'),
        '--workflow',
        path.join(alias, 'fixture.yml'),
      ],
      {
        cwd: alias,
        env: { ...process.env, JOVIE_PREFLIGHT_LEDGER: 'off' },
        encoding: 'utf8',
        timeout: 30000,
      }
    );
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /FAIL \(23\)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a trusted helper copied below a symlinked temp parent still enforces its gate', () => {
  const { root, real } = copiedCliFixture();
  const tempReal = path.join(root, 'temp-real');
  const tempAlias = path.join(root, 'temp-alias');
  mkdirSync(tempReal);
  symlinkSync(tempReal, tempAlias, 'dir');
  try {
    writeFileSync(
      path.join(real, 'fixture.yml'),
      `
jobs:
  ${JOB_ID}:
    steps:
      - name: Trusted product-lane guard
        run: |
          cp "$PREFLIGHT_CLASSIFIER" "$RUNNER_TEMP/product-lane-classifier.mjs"
          printf 'apps/web/app/page.tsx\\n' > "$RUNNER_TEMP/changed.txt"
          node "$RUNNER_TEMP/product-lane-classifier.mjs" --files-from "$RUNNER_TEMP/changed.txt" --qualification-profile deliberate-invalid-profile
`
    );
    const result = spawnSync(
      process.execPath,
      [
        path.join(real, 'scripts/preflight.mjs'),
        '--workflow',
        path.join(real, 'fixture.yml'),
      ],
      {
        cwd: real,
        env: {
          ...process.env,
          TMPDIR: tempAlias,
          PREFLIGHT_CLASSIFIER: path.join(
            ROOT,
            'scripts/lib/product-lane-classifier.mjs'
          ),
          JOVIE_PREFLIGHT_LEDGER: 'off',
        },
        encoding: 'utf8',
        timeout: 30000,
      }
    );
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.match(
      result.stdout,
      /Product lane classification failed: Unknown qualification profile: deliberate-invalid-profile/
    );
    assert.match(result.stdout, /FAIL \(1\)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('body preflight supplies a valid internal-work repair only for a missing decision', async () => {
  const before = 'export const operator = false;\n';
  const after = 'export const operator = true;\n';
  const filename = 'apps/web/lib/ovie/operator.ts';
  for (const missing of ['', 'releaseWorthy:false', '## Release note']) {
    const red = await lintRepairDiff(before, after, filename, missing);
    assert.ok(red.errors.some(error => error.includes('missing-metadata')));
    assert.equal(
      red.template,
      '<!-- customer-changelog/v1 {"releaseWorthy":false} -->'
    );
    const green = await lintRepairDiff(before, after, filename, red.template);
    assert.deepEqual(green.errors, []);
    assert.equal(green.template, '');
  }
  for (const invalid of [
    '<!-- customer-changelog/v1 nope -->',
    '<!-- customer-changelog/v1 {"releaseWorthy":false} -->\n<!-- customer-changelog/v1 {"releaseWorthy":false} -->',
  ]) {
    const result = await lintRepairDiff(before, after, filename, invalid);
    assert.ok(
      result.errors.some(error => error.startsWith('changelog-marker:'))
    );
    assert.equal(
      result.template,
      '',
      'never append another decision to invalid or ambiguous metadata'
    );
  }
  const internal = await lintRepairDiff(
    before,
    after,
    'scripts/operator.mjs',
    ''
  );
  assert.deepEqual(internal.errors, []);
  assert.equal(internal.template, '');
});
