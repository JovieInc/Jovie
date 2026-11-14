import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
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
import { snapshotSourceGuardActions } from './lib/source-guard-action-snapshot.mjs';
import {
  applyExclusions,
  buildPreflightEnv,
  buildProgram,
  chooseConcurrency,
  deriveSteps,
  exclusionReason,
  JOB_ID,
  lintBody,
  main,
  prepareStatement,
  splitStatements,
  substitute,
  WORKFLOW_PATH,
} from './preflight.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function copyPreflightCli(destination) {
  for (const file of [
    'preflight.mjs',
    'lib/preflight-depth.mjs',
    'lib/preflight-shell.mjs',
  ]) {
    copyFileSync(
      path.join(ROOT, 'scripts', file),
      path.join(destination, 'scripts', file)
    );
  }
}

function hookGitFixture({ behind = true, conflict = false, during = '' } = {}) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'pf-hook-base-')));
  const cwd = path.join(root, 'source');
  const origin = path.join(root, 'origin.git');
  const baseWriter = path.join(root, 'base');
  const marker = path.join(root, 'gate-ran');
  /** @type {NodeJS.ProcessEnv} */
  const env = {
    ...buildPreflightEnv(),
    JOVIE_PREFLIGHT_LEDGER: 'off',
    PREFLIGHT_FIXTURE_MARKER: marker,
    PREFLIGHT_FIXTURE_BASE: baseWriter,
  };
  const gitAt = (dir, ...args) => {
    const r = spawnSync('git', args, { cwd: dir, env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  const configure = dir => {
    gitAt(dir, 'config', 'user.name', 'Preflight fixture');
    gitAt(dir, 'config', 'user.email', 'fixture@example.com');
    gitAt(dir, 'config', 'commit.gpgsign', 'false');
  };
  mkdirSync(cwd);
  gitAt(root, 'init', '-q', '--bare', origin);
  gitAt(cwd, 'init', '-q', '-b', 'main');
  configure(cwd);
  writeFileSync(path.join(cwd, 'shared.txt'), 'base\n');
  writeFileSync(
    path.join(cwd, 'fixture.yml'),
    `jobs:\n  ${JOB_ID}:\n    steps:\n      - name: Exact source gate\n        run: |\n          node -e 'require("node:fs").writeFileSync(process.env.PREFLIGHT_FIXTURE_MARKER, "ran")'\n${
      during
        ? during
            .split('\n')
            .map(line => `          ${line}`)
            .join('\n')
        : ''
    }\n`
  );
  gitAt(cwd, 'add', '.');
  gitAt(cwd, 'commit', '-qm', 'base');
  gitAt(cwd, 'remote', 'add', 'origin', origin);
  gitAt(cwd, 'push', '-q', 'origin', 'main');
  gitAt(root, 'clone', '-q', '--branch', 'main', origin, baseWriter);
  configure(baseWriter);
  gitAt(cwd, 'checkout', '-qb', 'feature');
  writeFileSync(path.join(cwd, 'shared.txt'), 'source\n');
  gitAt(cwd, 'add', '.');
  gitAt(cwd, 'commit', '-qm', 'source');
  const head = gitAt(cwd, 'rev-parse', 'HEAD');
  if (behind) {
    writeFileSync(
      path.join(baseWriter, conflict ? 'shared.txt' : 'base-only.txt'),
      'upstream\n'
    );
    gitAt(baseWriter, 'add', '.');
    gitAt(baseWriter, 'commit', '-qm', 'upstream');
    gitAt(baseWriter, 'push', '-q', 'origin', 'main');
  }
  const run = async () => {
    const lines = [];
    const code = await main({
      argv: ['--hook', '--workflow', 'fixture.yml'],
      cwd,
      env,
      log: line => lines.push(line),
    });
    return { code, output: lines.join('\n') };
  };
  return { root, cwd, origin, marker, env, head, gitAt, run };
}

test('hook preserves the legacy lock and uses shared XDG only when home is unavailable', t => {
  const realFlock = spawnSync('which', ['flock'], { encoding: 'utf8' });
  if (realFlock.status !== 0)
    return t.skip('flock is unavailable on this host');
  const f = hookGitFixture({ behind: false, during: 'pnpm typecheck' });
  try {
    const bin = path.join(f.root, 'bin');
    const unavailableHome = path.join(f.root, 'unavailable-home');
    const fallbackHome = path.join(f.root, 'fallback-home');
    const cache = path.join(f.root, "cache $literal's area");
    const executed = path.join(f.root, 'typecheck-ran');
    mkdirSync(bin);
    mkdirSync(fallbackHome);
    writeFileSync(unavailableHome, 'not a directory');
    writeFileSync(
      path.join(bin, 'pnpm'),
      '#!/bin/sh\n"$PREFLIGHT_REAL_FLOCK" -n "$PREFLIGHT_EXPECTED_LOCK" true\n[ "$?" -eq 1 ] || exit 98\nprintf "%s" "$*" > "$PREFLIGHT_TYPECHECK_MARKER"\nexit 17\n',
      { mode: 0o755 }
    );
    const runner = `import { main } from ${JSON.stringify(new URL('./preflight.mjs', import.meta.url).href)};
process.exitCode = await main({argv: ['--hook', '--workflow', 'fixture.yml'], cwd: ${JSON.stringify(f.cwd)}});`;
    for (const [home, xdg, expectedCache] of [
      [unavailableHome, cache, cache],
      [
        fallbackHome,
        path.join(f.root, 'xdg-one'),
        path.join(fallbackHome, '.cache'),
      ],
      [
        fallbackHome,
        path.join(f.root, 'xdg-two'),
        path.join(fallbackHome, '.cache'),
      ],
      [fallbackHome, 'relative-cache', path.join(fallbackHome, '.cache')],
      [fallbackHome, '', path.join(fallbackHome, '.cache')],
      [fallbackHome, undefined, path.join(fallbackHome, '.cache')],
    ]) {
      rmSync(executed, { force: true });
      const result = spawnSync(
        process.execPath,
        ['--input-type=module', '-e', runner],
        {
          encoding: 'utf8',
          timeout: 30_000,
          env: {
            ...f.env,
            HOME: home,
            XDG_CACHE_HOME: xdg,
            PATH: `${bin}${path.delimiter}${f.env.PATH}`,
            PREFLIGHT_TYPECHECK_MARKER: executed,
            PREFLIGHT_REAL_FLOCK: realFlock.stdout.trim(),
            PREFLIGHT_EXPECTED_LOCK: path.join(
              expectedCache,
              'gem-typecheck.lock'
            ),
          },
        }
      );
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stdout, /FAIL \(17\)/, result.stderr);
      assert.equal(readFileSync(executed, 'utf8'), 'typecheck');
      assert.ok(existsSync(path.join(expectedCache, 'gem-typecheck.lock')));
      if (xdg && path.isAbsolute(xdg) && xdg !== expectedCache)
        assert.equal(existsSync(path.join(xdg, 'gem-typecheck.lock')), false);
      assert.equal(readFileSync(unavailableHome, 'utf8'), 'not a directory');
    }

    for (const xdg of [undefined, '', 'relative-cache', unavailableHome]) {
      rmSync(executed, { force: true });
      const result = spawnSync(
        process.execPath,
        ['--input-type=module', '-e', runner],
        {
          encoding: 'utf8',
          timeout: 30_000,
          env: {
            ...f.env,
            HOME: unavailableHome,
            XDG_CACHE_HOME: xdg,
            PATH: `${bin}${path.delimiter}${f.env.PATH}`,
            PREFLIGHT_TYPECHECK_MARKER: executed,
          },
        }
      );
      assert.equal(result.status, 1, result.stderr);
      assert.equal(existsSync(executed), false);
      assert.match(result.stderr, /ENOTDIR|EEXIST/);
    }
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('hook qualifies a clean behind-base source without changing its head', async () => {
  const f = hookGitFixture();
  try {
    const result = await f.run();
    assert.equal(result.code, 0, result.output);
    assert.equal(readFileSync(f.marker, 'utf8'), 'ran');
    assert.equal(f.gitAt(f.cwd, 'rev-parse', 'HEAD'), f.head);
    assert.equal(f.gitAt(f.cwd, 'status', '--porcelain'), '');
    assert.match(result.output, /mergeable.*base=/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('hook qualification executes and reports failures from every heavy command category', async () => {
  const commands = [
    'typecheck',
    'biome:check',
    'ci:control:test',
    'test:coverage',
    'run build',
    'storybook',
  ];
  const f = hookGitFixture({
    during: commands.map(command => `pnpm ${command}`).join('\n'),
  });
  try {
    const bin = path.join(f.root, 'bin');
    const executed = path.join(f.root, 'qualification-commands');
    mkdirSync(bin);
    writeFileSync(
      path.join(bin, 'pnpm'),
      '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$PREFLIGHT_QUALIFICATION_MARKER"\nexit 17\n',
      { mode: 0o755 }
    );
    // Retain the real lock, but keep fixture locking out of a live host's lane.
    const realFlock = spawnSync('which', ['flock'], {
      env: f.env,
      encoding: 'utf8',
    });
    if (realFlock.status === 0) {
      f.env.PREFLIGHT_REAL_FLOCK = realFlock.stdout.trim();
      f.env.PREFLIGHT_QUALIFICATION_LOCK = path.join(f.root, 'typecheck.lock');
      writeFileSync(
        path.join(bin, 'flock'),
        '#!/bin/sh\nshift\nexec "$PREFLIGHT_REAL_FLOCK" "$PREFLIGHT_QUALIFICATION_LOCK" "$@"\n',
        { mode: 0o755 }
      );
    }
    f.env.PREFLIGHT_QUALIFICATION_MARKER = executed;
    f.env.PATH = `${bin}${path.delimiter}${f.env.PATH}`;
    const result = await f.run();
    assert.equal(result.code, 1, result.output);
    assert.deepEqual(
      readFileSync(executed, 'utf8').trim().split('\n'),
      commands
    );
    assert.equal(
      (result.output.match(/FAIL \(17\)/g) ?? []).length,
      commands.length
    );
    assert.doesNotMatch(result.output, /EXCLUDED:/);
    assert.equal(f.gitAt(f.cwd, 'rev-parse', 'HEAD'), f.head);
    assert.equal(f.gitAt(f.cwd, 'status', '--porcelain'), '');
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

// Execute the real workflow's background group and wait guard without running tsc.
// This must keep the first failure even when the last command would succeed.
for (const [testsStatus, storiesStatus] of [
  [17, 0],
  [0, 23],
  [0, 0],
]) {
  test(`hook keeps background typecheck failures (${testsStatus}/${storiesStatus})`, () => {
    const step = deriveSteps(
      readFileSync(path.join(ROOT, WORKFLOW_PATH), 'utf8')
    ).find(item => item.name === 'Run deterministic source contract');
    assert.ok(step);
    const start = step.run.indexOf('web_types_log=');
    const end = step.run.indexOf('pnpm biome:check', start);
    assert.ok(start >= 0 && end > start);
    const group = step.run.slice(start, end);
    assert.match(group, /typecheck:tests[\s\S]*typecheck:stories/);
    assert.match(group, /wait "\$web_types_pid"/);
    assert.match(group, /test "\$web_types_status" -eq 0 \|\| exit/);
    const dir = mkdtempSync(path.join(tmpdir(), 'pf-background-'));
    try {
      const shell = `pnpm() {
  printf '%s\\n' "$*" >> "$PREFLIGHT_TEST_COMMANDS"
  case "$*" in
    *typecheck:tests) return ${testsStatus} ;;
    *typecheck:stories) return ${storiesStatus} ;;
    *later-gate) return 29 ;;
    *) return 0 ;;
  esac
}
`;
      const statements = splitStatements(
        `${group}\npnpm later-gate\npnpm final-success\n`
      );
      const result = spawnSync(
        'bash',
        ['-c', shell + buildProgram(statements, {}, { qualification: true })],
        {
          env: {
            ...buildPreflightEnv(),
            TMPDIR: dir,
            PREFLIGHT_TEST_COMMANDS: path.join(dir, 'commands'),
          },
          encoding: 'utf8',
        }
      );
      assert.equal(result.status, 0, result.stderr);
      const results = [...result.stdout.matchAll(/@@PF-END (\d+) (\d+)/g)].map(
        match => Number(match[2])
      );
      const failure = testsStatus || storiesStatus;
      assert.deepEqual(
        results.filter(Boolean),
        failure ? [failure, 29] : [29],
        result.stdout
      );
      const commands = readFileSync(path.join(dir, 'commands'), 'utf8');
      assert.match(commands, /typecheck:tests/);
      if (!testsStatus) assert.match(commands, /typecheck:stories/);
      assert.match(commands, /later-gate\nfinal-success/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('hook aggregates compound failures without rejecting handled conditions', () => {
  const statements = splitStatements(`
{ false; true; }
false || true
if false; then false; fi
(false; true)
printf 'last gate ran\\n'
`);
  const result = spawnSync(
    'bash',
    ['-c', buildProgram(statements, {}, { qualification: true })],
    { encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    [...result.stdout.matchAll(/@@PF-END (\d+) (\d+)/g)].map(match =>
      Number(match[2])
    ),
    [1, 0, 0, 1, 0],
    result.stdout
  );
  assert.match(result.stdout, /last gate ran/);
});

test('hook blocks real merge conflicts before executing source gates', async () => {
  const f = hookGitFixture({ conflict: true });
  try {
    const result = await f.run();
    assert.equal(result.code, 1);
    assert.equal(existsSync(f.marker), false);
    assert.equal(f.gitAt(f.cwd, 'rev-parse', 'HEAD'), f.head);
    assert.equal(f.gitAt(f.cwd, 'status', '--porcelain'), '');
    assert.match(result.output, /merge conflict/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('a clean behind-base hook still fails a real source check', async () => {
  const f = hookGitFixture({ during: "node -e 'process.exit(17)'" });
  try {
    const result = await f.run();
    assert.equal(result.code, 1, result.output);
    assert.equal(readFileSync(f.marker, 'utf8'), 'ran');
    assert.match(result.output, /FAIL \(17\)/);
    assert.equal(f.gitAt(f.cwd, 'rev-parse', 'HEAD'), f.head);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('hook rejects failed refresh instead of accepting a cached base', async () => {
  const f = hookGitFixture({ behind: false });
  try {
    f.gitAt(
      f.cwd,
      'remote',
      'set-url',
      'origin',
      path.join(f.root, 'missing.git')
    );
    const result = await f.run();
    assert.equal(result.code, 1);
    assert.equal(existsSync(f.marker), false);
    assert.match(result.output, /cannot fetch/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

for (const [command, response] of [
  ['merge-tree', 'exit 2'],
  ['merge-tree', 'printf "not-a-tree\\n"; exit 0'],
  ['cat-file', 'printf "tree\\n"; exit 2'],
]) {
  test(`hook fails closed on an unknown merge proof (${command}: ${response})`, async () => {
    const f = hookGitFixture();
    try {
      const bin = path.join(f.root, 'bin');
      mkdirSync(bin);
      writeFileSync(
        path.join(bin, 'git'),
        `#!/bin/sh\nif [ "$1" = ${command} ]; then ${response}; fi\nexec /usr/bin/git "$@"\n`,
        { mode: 0o755 }
      );
      f.env.PATH = `${bin}:${f.env.PATH}`;
      const result = await f.run();
      assert.equal(result.code, 1);
      assert.equal(existsSync(f.marker), false);
      assert.match(result.output, /cannot prove mergeability/);
      assert.doesNotMatch(result.output, /merge conflict/);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });
}

test('hook rejects a base ref changed while proving mergeability', async () => {
  const f = hookGitFixture();
  try {
    const bin = path.join(f.root, 'bin');
    mkdirSync(bin);
    writeFileSync(
      path.join(bin, 'git'),
      '#!/bin/sh\nif [ "$1" = merge-tree ]; then\n  /usr/bin/git "$@" || exit $?\n  /usr/bin/git update-ref refs/remotes/origin/main HEAD\n  exit $?\nfi\nexec /usr/bin/git "$@"\n',
      { mode: 0o755 }
    );
    f.env.PATH = `${bin}:${f.env.PATH}`;
    const result = await f.run();
    assert.equal(result.code, 1, result.output);
    assert.equal(existsSync(f.marker), false);
    assert.match(result.output, /base moved during mergeability proof/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

for (const conflict of [false, true]) {
  test(`hook rechecks a base moved during source gates (${conflict ? 'conflict' : 'clean'})`, async () => {
    const file = conflict ? 'shared.txt' : 'base-only.txt';
    const f = hookGitFixture({
      behind: false,
      during: `printf 'new base\\n' > "$PREFLIGHT_FIXTURE_BASE/${file}"\ngit -C "$PREFLIGHT_FIXTURE_BASE" add .\ngit -C "$PREFLIGHT_FIXTURE_BASE" commit -qm moved\ngit -C "$PREFLIGHT_FIXTURE_BASE" push -q origin main`,
    });
    try {
      const result = await f.run();
      assert.equal(result.code, conflict ? 1 : 0, result.output);
      assert.equal(readFileSync(f.marker, 'utf8'), 'ran');
      assert.equal(f.gitAt(f.cwd, 'rev-parse', 'HEAD'), f.head);
      assert.match(result.output, conflict ? /merge conflict/ : /base moved/);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });
}

test('hook rejects a source head changed during its gates', async () => {
  const f = hookGitFixture({
    behind: false,
    during:
      'git -c commit.gpgsign=false commit --allow-empty -qm unexpected-source-change',
  });
  try {
    const result = await f.run();
    assert.equal(result.code, 1, result.output);
    assert.equal(readFileSync(f.marker, 'utf8'), 'ran');
    assert.match(result.output, /source head changed/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

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

async function runPlan(text, extraEnv = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'pf-test-'));
  mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
  writeFileSync(path.join(dir, WORKFLOW_PATH), text);
  const lines = [];
  const code = await main({
    argv: ['--workflow', path.join(dir, WORKFLOW_PATH)],
    env: {
      JOVIE_PREFLIGHT_LEDGER: 'off',
      PATH: process.env.PATH,
      XDG_CACHE_HOME: path.join(dir, 'cache'),
      ...extraEnv,
    },
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

test('hosted partition retains merged guards in local preflight and rejects incomplete cleanup', () => {
  const source = readFileSync(path.join(ROOT, WORKFLOW_PATH), 'utf8');
  const steps = deriveSteps(source);
  const guards = steps.filter(
    step =>
      step.name === 'Validate disk-read source contracts from trusted base'
  );
  assert.equal(guards.length, 1);
  assert.equal(guards[0].skip, '');
  assert.match(guards[0].run, /selectSourceGuards/);
  assert.throws(
    () =>
      deriveSteps(
        source.replace('id: source_guard_proof', 'id: missing_cleanup')
      ),
    /no cleanup proof/
  );
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

test('concurrency follows free RAM and load, with an override', () => {
  const host = { freeGb: 30, load1: 2, cores: 16 };
  assert.equal(chooseConcurrency(host), 3);
  assert.equal(chooseConcurrency({ ...host, freeGb: 12 }), 1);
  assert.equal(chooseConcurrency({ ...host, freeGb: 9 }), 1);
  assert.equal(chooseConcurrency({ ...host, load1: 25 }), 1);
  assert.equal(chooseConcurrency({ ...host, override: '2' }), 2);
});

test('heavy statements are excluded with a reason, light ones are not', () => {
  assert.match(exclusionReason('pnpm typecheck'), /hosted CI/);
  assert.match(exclusionReason('pnpm run typecheck:scripts'), /hosted CI/);
  assert.match(
    exclusionReason('pnpm --filter @jovie/web run typecheck:tests'),
    /hosted CI/
  );
  assert.equal(exclusionReason('pnpm component-ship-gate'), '');
  assert.equal(exclusionReason('pnpm screen-registration-gate'), '');
  assert.equal(
    exclusionReason(
      'ESLINT_CHANGED_BASE="origin/main" pnpm --filter @jovie/web run lint:eslint:changed'
    ),
    ''
  );
  assert.equal(exclusionReason('web_types_pid=$!'), '');
});

test('every typecheck/build statement in the real workflow is excluded', () => {
  const steps = deriveSteps(
    readFileSync(path.join(ROOT, WORKFLOW_PATH), 'utf8')
  );
  for (const step of steps.filter(s => !s.skip))
    for (const statement of splitStatements(step.run))
      assert.doesNotMatch(
        applyExclusions(statement).text,
        /\bpnpm\b[^\n]*\btypecheck\b/,
        statement
      );
});

test('steps run concurrently and still list every failure', async () => {
  // Neither worker can finish until both have started. A serial runner exits
  // with the hang-guard code instead of the expected failure code.
  const rendezvous = n => `      - name: Rendezvous ${n}
        run: node -e "const fs = require('node:fs'); fs.writeFileSync('started-${n}', ''); setTimeout(() => process.exit(99), 30000); setInterval(() => { if (fs.existsSync('started-4') && fs.existsSync('started-5')) process.exit(${n}); }, 10)"`;
  const { code, out } = await runPlan(
    workflow([rendezvous(4), rendezvous(5)].join('\n')),
    {
      PREFLIGHT_JOBS: '3',
    }
  );
  assert.equal(code, 1);
  assert.match(out, /FAIL \(4\)/);
  assert.match(out, /FAIL \(5\)/);
});

test('commands inside a compound statement are excluded line by line', () => {
  const { text, excluded } = applyExclusions(
    '(\n  pnpm --filter @jovie/web run typecheck:tests\n  pnpm component-ship-gate\n)'
  );
  assert.match(text, /^\(\n {2}true\n {2}pnpm component-ship-gate\n\)$/);
  assert.equal(excluded.length, 1);
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
  // The publication hook sets this on the test. This spawn is the preflight
  // under test, not a nested re-entry.
  delete fixtureEnv.JOVIE_PREFLIGHT_DEPTH;
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
    mkdirSync(path.join(parent, 'scripts', 'lib'), { recursive: true });
    mkdirSync(path.join(parent, '.github', 'workflows'), { recursive: true });
    copyPreflightCli(parent);
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
    const origin = path.join(root, 'origin.git');
    git(root, 'init', '-q', '--bare', origin);
    git(parent, 'remote', 'add', 'origin', origin);
    git(parent, 'push', '-q', 'origin', 'main');
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
  mkdirSync(path.join(real, 'scripts', 'lib'), { recursive: true });
  copyPreflightCli(real);
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
        env: {
          ...process.env,
          JOVIE_PREFLIGHT_LEDGER: 'off',
          JOVIE_PREFLIGHT_DEPTH: '',
        },
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
          JOVIE_PREFLIGHT_DEPTH: '',
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

function actionSnapshotFixture(t, setup = '') {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'pf-actions-')));
  const repo = path.join(root, 'repo');
  const record = path.join(root, 'workspaces');
  mkdirSync(repo);
  const env = {
    ...buildPreflightEnv(),
    JOVIE_PREFLIGHT_LEDGER: 'off',
    PREFLIGHT_SNAPSHOTS: record,
    PREFLIGHT_SOURCE_WORKSPACE: repo,
    // Ambient or step-level state cannot select someone else's generation.
    SOURCE_GUARD_ACTION_WORKSPACE: repo,
  };
  const write = (name, content) => {
    const destination = path.join(repo, name);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, content);
  };
  const git = (...args) => {
    const result = spawnSync(
      'git',
      ['-c', 'core.hooksPath=/dev/null', ...args],
      {
        cwd: repo,
        env,
        encoding: 'utf8',
      }
    );
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const action = generation =>
    `runs:\n  using: composite\n  steps:\n    - shell: bash\n      run: echo ${generation}\n`;
  write('.gitignore', 'tmp/\nfixture.yml\n');
  write('.github/actions/setup-node-pnpm/action.yml', action('first'));
  write('.github/actions/setup-playwright/action.yml', action('browser'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Preflight snapshot fixture');
  git('config', 'user.email', 'fixture@example.com');
  git('add', '.');
  git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'first generation');
  git('checkout', '-qb', 'subject');
  git('remote', 'add', 'origin', repo);
  const source = 'scripts/lib/source-guard-action-snapshot.mjs';
  const step = deriveSteps(
    readFileSync(path.join(ROOT, WORKFLOW_PATH), 'utf8')
  ).find(candidate => candidate.name === 'Preserve merged action generation');
  assert.ok(step, 'exercise the real workflow producer');
  write(
    'fixture.yml',
    JSON.stringify({
      jobs: {
        [JOB_ID]: {
          steps: [
            {
              name: 'Record attempt workspace',
              run: `printf '%s\\n' "$RUNNER_TEMP" >> "$PREFLIGHT_SNAPSHOTS"\n${setup}`,
            },
            {
              name: step.name,
              // Use the original helper URL so coverage measures changed code.
              run: step.run.replace(
                source,
                JSON.stringify(path.join(ROOT, source))
              ),
              env: { SOURCE_GUARD_ACTION_WORKSPACE: repo },
            },
            {
              name: 'Other steps retain their own workspace',
              run: 'test "$SOURCE_GUARD_ACTION_WORKSPACE" = "$PREFLIGHT_SOURCE_WORKSPACE"',
            },
          ],
        },
      },
    })
  );
  const workspaces = () => {
    try {
      return readFileSync(record, 'utf8').trim().split('\n').filter(Boolean);
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  };
  t.after(() => {
    for (const workspace of workspaces())
      rmSync(workspace, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  });
  return {
    repo,
    root,
    write,
    git,
    action,
    workspaces,
    run: async () => {
      const lines = [];
      const code = await main({
        argv: ['--workflow', path.join(repo, 'fixture.yml')],
        cwd: repo,
        env,
        log: line => lines.push(line),
      });
      return { code, out: lines.join('\n') };
    },
    snapshot: workspace =>
      path.join(
        workspace,
        'tmp/source-guard-actions/setup-node-pnpm/action.yml'
      ),
  };
}

test('real local qualification isolates retries, changed heads, stale artifacts and concurrent attempts', async t => {
  const f = actionSnapshotFixture(t);
  f.write('tmp/source-guard-actions/owner.txt', 'another attempt owns this\n');
  const firstHead = f.git('rev-parse', 'HEAD');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await f.run();
    assert.equal(result.code, 0, result.out);
    assert.equal(f.git('rev-parse', 'HEAD'), firstHead);
  }
  const firstWorkspaces = f.workspaces();
  assert.equal(firstWorkspaces.length, 2);
  for (const workspace of firstWorkspaces)
    assert.equal(
      readFileSync(f.snapshot(workspace), 'utf8'),
      f.action('first')
    );

  f.write('.github/actions/setup-node-pnpm/action.yml', f.action('second'));
  f.git('add', '.github/actions/setup-node-pnpm/action.yml');
  f.git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'second generation');
  assert.notEqual(f.git('rev-parse', 'HEAD'), firstHead);
  const retry = await f.run();
  assert.equal(retry.code, 0, retry.out);
  const concurrent = await Promise.all([f.run(), f.run()]);
  for (const result of concurrent) assert.equal(result.code, 0, result.out);
  const workspaces = f.workspaces();
  assert.equal(workspaces.length, 5);
  assert.equal(new Set(workspaces).size, 5);
  for (const workspace of workspaces.slice(2))
    assert.equal(
      readFileSync(f.snapshot(workspace), 'utf8'),
      f.action('second')
    );
  for (const workspace of firstWorkspaces)
    assert.equal(
      readFileSync(f.snapshot(workspace), 'utf8'),
      f.action('first')
    );
  assert.equal(
    readFileSync(
      path.join(f.repo, 'tmp/source-guard-actions/owner.txt'),
      'utf8'
    ),
    'another attempt owns this\n'
  );
  assert.equal(f.git('status', '--porcelain'), '');
});

for (const [
  name,
  setup,
  expected,
] of /** @type {Array<[string, string, RegExp]>} */ ([
  [
    'malformed parent',
    'printf owner > "$RUNNER_TEMP/tmp"',
    /ordinary directory/,
  ],
  [
    'linked parent',
    'ln -s "$PREFLIGHT_SNAPSHOTS.outside" "$RUNNER_TEMP/tmp"',
    /ordinary directory/,
  ],
  [
    'occupied target',
    'mkdir -p "$RUNNER_TEMP/tmp/source-guard-actions"; printf owner > "$RUNNER_TEMP/tmp/source-guard-actions/owner"',
    /EEXIST/,
  ],
  [
    'malformed target',
    'mkdir "$RUNNER_TEMP/tmp"; printf owner > "$RUNNER_TEMP/tmp/source-guard-actions"',
    /EEXIST/,
  ],
  [
    'linked target',
    'mkdir "$RUNNER_TEMP/tmp"; ln -s "$PREFLIGHT_SNAPSHOTS.outside" "$RUNNER_TEMP/tmp/source-guard-actions"',
    /EEXIST/,
  ],
])) {
  test(`real local qualification propagates ${name} snapshot failure without replacing its owner`, async t => {
    const f = actionSnapshotFixture(t, setup);
    const outside = path.join(f.root, 'workspaces.outside');
    mkdirSync(outside);
    writeFileSync(path.join(outside, 'owner'), 'outside owner');
    const result = await f.run();
    assert.equal(result.code, 1, result.out);
    assert.match(result.out, expected);
    assert.equal(
      readFileSync(path.join(outside, 'owner'), 'utf8'),
      'outside owner'
    );
    const [workspace] = f.workspaces();
    if (name === 'occupied target')
      assert.equal(
        readFileSync(
          path.join(workspace, 'tmp/source-guard-actions/owner'),
          'utf8'
        ),
        'owner'
      );
    if (name === 'malformed target')
      assert.equal(
        readFileSync(path.join(workspace, 'tmp/source-guard-actions'), 'utf8'),
        'owner'
      );
    if (name === 'malformed parent')
      assert.equal(readFileSync(path.join(workspace, 'tmp'), 'utf8'), 'owner');
  });
}

test('real local qualification reports a genuine source snapshot failure and succeeds only after repair', async t => {
  const f = actionSnapshotFixture(t);
  f.write(
    '.github/actions/setup-node-pnpm/action.yml',
    'runs:\n  using: node24\n  main: missing.js\n'
  );
  const failed = await f.run();
  assert.equal(failed.code, 1, failed.out);
  assert.match(failed.out, /payload does not resolve inside its package/);
  f.write('.github/actions/setup-node-pnpm/action.yml', f.action('repaired'));
  const repaired = await f.run();
  assert.equal(repaired.code, 0, repaired.out);
  const [failedWorkspace, repairedWorkspace] = f.workspaces();
  assert.notEqual(failedWorkspace, repairedWorkspace);
  assert.throws(() => readFileSync(f.snapshot(failedWorkspace)), /ENOENT/);
  assert.equal(
    readFileSync(f.snapshot(repairedWorkspace), 'utf8'),
    f.action('repaired')
  );
});

test('an explicit snapshot workspace rejects empty, relative, file and symlink destinations', t => {
  const f = actionSnapshotFixture(t);
  const file = path.join(f.root, 'file');
  const link = path.join(f.root, 'link');
  writeFileSync(file, 'workspace owner');
  symlinkSync(f.repo, link, 'dir');
  for (const workspace of ['', 'relative', file, link]) {
    assert.throws(
      () => snapshotSourceGuardActions(f.repo, workspace),
      /workspace must be an (?:absolute|ordinary) directory/
    );
  }
  assert.equal(readFileSync(file, 'utf8'), 'workspace owner');
});
