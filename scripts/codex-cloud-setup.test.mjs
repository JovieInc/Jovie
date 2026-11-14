import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
import { join, resolve } from 'node:path';
import test from 'node:test';
import { bootstrap } from './codex-cloud-setup.mjs';
import { evaluateRepoHygiene } from './repo-hygiene-guard.mjs';

test('desktop source configuration stays shareable without admitting runtime state', () => {
  for (const path of [
    '.codex/config.toml',
    '.codex/hooks.json',
    '.codex/environments/environment.toml',
  ]) {
    assert.deepEqual(
      evaluateRepoHygiene({ addedPaths: [path] }).errors,
      [],
      path
    );
  }
  for (const path of [
    '.codex/local-env.toml',
    '.codex/session/runtime.json',
    '.codex/environments/private.toml',
    '.codex/environments/environment.toml.bak',
  ]) {
    assert.match(
      evaluateRepoHygiene({ addedPaths: [path] }).errors.join('\n'),
      /generated output path is not tracked/,
      path
    );
  }
});

test('remote project MCP servers declare a transport supported by current Claude Code', () => {
  const config = JSON.parse(readFileSync(resolve('.mcp.json'), 'utf8'));
  for (const [name, server] of Object.entries(config.mcpServers)) {
    if (server.url)
      assert.ok(
        ['http', 'sse', 'ws'].includes(server.type),
        `${name} would be skipped without an explicit transport`
      );
  }
});

test('project MCP dogfoods the anonymous workspace CLI without worker privileges', () => {
  const config = JSON.parse(readFileSync(resolve('.mcp.json'), 'utf8'));
  assert.deepEqual(config.mcpServers.jovie, {
    type: 'stdio',
    command: 'node',
    args: ['packages/jovie-cli/dist/cli.js', 'mcp'],
    // Override any inherited worker identity so only public tools are exposed.
    env: { JOVIE_WORKER_TOKEN: '' },
  });
});

function fixture(t, behavior = '') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'jovie-codex-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'bin'));
  symlinkSync(process.execPath, join(root, 'bin/node'));
  writeFileSync(join(root, '.nvmrc'), process.versions.node);
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ packageManager: 'pnpm@9.15.9' })
  );
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'preserve lock');
  writeFileSync(join(root, '.env.local'), 'preserve environment');
  writeFileSync(
    join(root, 'bin/gh'),
    '#!/bin/bash\n[[ "$*" == "api --help" ]] || exit 99\nprintf "FLAGS\\n  --slurp Aggregate paginated JSON\\n"\n',
    { mode: 0o755 }
  );
  writeFileSync(
    join(root, 'bin/pnpm'),
    `#!/bin/bash
set -eu
if [[ "$*" == '--version' ]]; then
  printf '%s' "\${CI-unset}" > "$PWD/version-ci"
  ${behavior || "echo '9.15.9'"}
  exit 0
fi
printf '%s\\n' "$PWD" "$*" "$PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD" "$ONNXRUNTIME_NODE_INSTALL" "\${CI-unset}" > "$PWD/install-receipt"
exit "\${INSTALL_STATUS:-0}"
`,
    { mode: 0o755 }
  );
  return { root, env: { PATH: `${join(root, 'bin')}:/usr/bin:/bin` } };
}

test('installs frozen dependencies in the repository without touching environment or lockfiles', t => {
  const { root, env } = fixture(t);
  bootstrap(root, env);
  assert.equal(
    readFileSync(join(root, 'install-receipt'), 'utf8'),
    `${root}\ninstall --frozen-lockfile --prefer-offline\n1\nskip\ntrue\n`
  );
  assert.equal(
    readFileSync(join(root, '.env.local'), 'utf8'),
    'preserve environment'
  );
  assert.equal(
    readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8'),
    'preserve lock'
  );
});

test('forces noninteractive installation without changing the caller or version probe environment', t => {
  for (const ci of [undefined, 'false']) {
    const { root, env } = fixture(t);
    if (ci !== undefined) env.CI = ci;
    if (process.env.NODE_V8_COVERAGE)
      env.NODE_V8_COVERAGE = process.env.NODE_V8_COVERAGE;
    const before = { ...env };
    const processCi = process.env.CI;
    bootstrap(root, env);
    assert.equal(readFileSync(join(root, 'version-ci'), 'utf8'), ci ?? 'unset');
    assert.equal(
      readFileSync(join(root, 'install-receipt'), 'utf8').split('\n')[4],
      'true'
    );
    assert.deepEqual(env, before);
    assert.equal(process.env.CI, processCi);
  }
});

test('rejects a runtime mismatch before running the installer', t => {
  const { root, env } = fixture(t);
  writeFileSync(join(root, '.nvmrc'), '0.0.0');
  assert.throws(() => bootstrap(root, env), /Expected Node/);
});

test('requires an exact pnpm pin', t => {
  const { root, env } = fixture(t);
  for (const packageManager of [undefined, 'npm@10.0.0', 'pnpm@latest']) {
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ packageManager })
    );
    assert.throws(() => bootstrap(root, env), /exact pnpm/);
  }
});

test('fails closed on missing pnpm, wrong package manager, and failed version probe', t => {
  for (const behavior of ["echo '10.0.0'", 'exit 7']) {
    const { root, env } = fixture(t, behavior);
    assert.throws(() => bootstrap(root, env), /pnpm must resolve/);
  }
  const { root } = fixture(t);
  assert.throws(
    () => bootstrap(root, { PATH: join(root, 'missing') }),
    /ENOENT/
  );
});

test('propagates installer failures and signals', t => {
  const { root, env } = fixture(t);
  assert.throws(
    () => bootstrap(root, { ...env, INSTALL_STATUS: '42' }),
    /failed \(42\)/
  );
  writeFileSync(
    join(root, 'bin/pnpm'),
    '#!/bin/bash\nif [[ "$*" == "--version" ]]; then echo 9.15.9; else kill -TERM $$; fi\n',
    { mode: 0o755 }
  );
  assert.throws(() => bootstrap(root, env), /SIGTERM/);
});

test('reports executable disappearance between probe and install', t => {
  const { root, env } = fixture(t, 'echo 9.15.9; rm -- "$0"');
  assert.throws(() => bootstrap(root, env), /ENOENT/);
});

function copyBootstrapScripts(root) {
  mkdirSync(join(root, 'scripts/lib'), { recursive: true });
  mkdirSync(join(root, 'scripts/hooks'), { recursive: true });
  writeFileSync(
    join(root, 'scripts/hooks/configure-git-hooks.sh'),
    '#!/bin/bash\nprintf configured > hook-configured\n'
  );
  for (const name of [
    'setup.sh',
    'codex-setup.sh',
    'codex-cloud-setup.mjs',
    'lib/setup-worktree-health.sh',
  ])
    copyFileSync(resolve('scripts', name), join(root, 'scripts', name));
}

test('warns offline about an incompatible installed gh without blocking setup or SessionStart', t => {
  for (const behavior of [
    "printf 'FLAGS\\n  --paginate Paginate\\n'",
    "printf 'FLAGS\\n  --slurp Slurp\\n'; exit 7",
    "printf 'EXAMPLES\\n  gh api --slurp\\nFLAGS\\n  --slurped Other\\n'",
  ]) {
    for (const args of [
      ['scripts/codex-setup.sh'],
      ['scripts/codex-setup.sh', '--codex-hook'],
      ['scripts/setup.sh'],
    ]) {
      const { root, env } = fixture(t);
      copyBootstrapScripts(root);
      if (args[0] === 'scripts/setup.sh') {
        for (const gitArgs of [
          ['init'],
          ['add', '.nvmrc', 'package.json', 'pnpm-lock.yaml'],
        ]) {
          assert.equal(spawnSync('git', gitArgs, { cwd: root }).status, 0);
        }
        mkdirSync(join(root, 'node_modules/.cache/jovie-setup'), {
          recursive: true,
        });
        writeFileSync(join(root, 'node_modules/.modules.yaml'), '');
        const hash = spawnSync(
          'bash',
          [
            '-c',
            'source "$1"; jovie_setup_hash_dependency_inputs "$2"',
            'fixture',
            resolve('scripts/lib/setup-worktree-health.sh'),
            root,
          ],
          { encoding: 'utf8' }
        );
        assert.equal(hash.status, 0, hash.stderr);
        writeFileSync(
          join(root, 'node_modules/.cache/jovie-setup/deps.sha256'),
          hash.stdout
        );
      }
      writeFileSync(
        join(root, 'bin/gh'),
        `#!/bin/bash
printf '%s\\n' "$*" >> "$PWD/gh-receipt"
[[ "$*" == 'api --help' ]] || exit 99
${behavior}
`,
        { mode: 0o755 }
      );
      const result = spawnSync('bash', args, {
        cwd: root,
        encoding: 'utf8',
        env: { ...env, HOME: root, JOVIE_CODEX_SECRET_FREE: '1' },
      });
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stderr, /WARNING:.*must support --slurp/);
      assert.ok(result.stderr.includes(join(root, 'bin/gh')));
      assert.match(result.stderr, /existing installation/);
      assert.equal(
        readFileSync(join(root, 'gh-receipt'), 'utf8'),
        'api --help\n'
      );
      if (args[0] === 'scripts/setup.sh')
        assert.match(result.stdout, /Worktree already healthy/);
      else
        assert.match(
          readFileSync(join(root, 'install-receipt'), 'utf8'),
          /install --frozen-lockfile/
        );
      assert.equal(
        readFileSync(join(root, 'hook-configured'), 'utf8'),
        'configured'
      );
    }
  }
});

test('keeps a missing gh optional without auth or network calls', t => {
  const { root } = fixture(t);
  rmSync(join(root, 'bin/gh'));
  const result = spawnSync(
    '/bin/bash',
    [
      '-c',
      'source "$1"; jovie_setup_gh_api_slurp_ok',
      'fixture',
      resolve('scripts/lib/setup-worktree-health.sh'),
    ],
    { encoding: 'utf8', env: { PATH: join(root, 'bin') } }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout + result.stderr, '');
});

test('secret-free SessionStart uses the dependency lane and emits valid hook JSON from any cwd', t => {
  const { root, env } = fixture(t);
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, 'nested'));
  mkdirSync(join(root, 'scripts/hooks'));
  writeFileSync(
    join(root, 'scripts/hooks/configure-git-hooks.sh'),
    '#!/bin/bash\nprintf configured > hook-configured\n'
  );
  copyBootstrapScripts(root);
  writeFileSync(join(root, 'scripts/setup.sh'), '#!/bin/bash\nexit 99\n');
  writeFileSync(
    join(root, 'scripts/codex-gbrain-sync.sh'),
    '#!/bin/bash\nexit 99\n'
  );
  const result = spawnSync(
    'bash',
    [join(root, 'scripts/codex-setup.sh'), '--codex-hook'],
    {
      cwd: join(root, 'nested'),
      encoding: 'utf8',
      input: '{}',
      env: {
        ...env,
        PATH: `${env.PATH}:${process.env.PATH}`,
        JOVIE_CODEX_SECRET_FREE: '1',
        NVM_DIR: join(root, 'missing'),
      },
    }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    readFileSync(join(root, 'hook-configured'), 'utf8'),
    'configured'
  );
  assert.equal(
    JSON.parse(result.stdout).hookSpecificOutput.hookEventName,
    'SessionStart'
  );
  assert.match(
    JSON.parse(result.stdout).hookSpecificOutput.additionalContext,
    /secret-free/
  );
});

test('the CLI exits nonzero when the frozen dependency installation fails', t => {
  const { root, env } = fixture(t);
  mkdirSync(join(root, 'scripts'));
  copyFileSync(
    resolve('scripts/codex-cloud-setup.mjs'),
    join(root, 'scripts/codex-cloud-setup.mjs')
  );
  symlinkSync(root, join(root, 'linked-root'));
  const result = spawnSync(
    process.execPath,
    [join(root, 'linked-root/scripts/codex-cloud-setup.mjs')],
    {
      encoding: 'utf8',
      env: { ...env, INSTALL_STATUS: '42' },
    }
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pnpm install failed/);
});

test('desktop actions select the repository and forward arguments without reinstalling', t => {
  const { root, env } = fixture(t);
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, 'nested'));
  copyFileSync(
    resolve('scripts/codex-setup.sh'),
    join(root, 'scripts/codex-setup.sh')
  );
  writeFileSync(
    join(root, 'bin/pnpm'),
    '#!/bin/bash\nprintf "%s\\n" "$PWD" "$*"\n',
    { mode: 0o755 }
  );
  /** @type {import('node:child_process').SpawnSyncOptionsWithStringEncoding} */
  const options = {
    cwd: join(root, 'nested'),
    encoding: 'utf8',
    env: { ...env, NVM_DIR: join(root, 'missing') },
  };
  const result = spawnSync(
    'bash',
    [join(root, 'scripts/codex-setup.sh'), '--run', 'test', '--bail'],
    options
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `${root}\ntest --bail\n`);
  const invalid = spawnSync(
    'bash',
    [join(root, 'scripts/codex-setup.sh'), '--run'],
    options
  );
  assert.equal(invalid.status, 2);
});
