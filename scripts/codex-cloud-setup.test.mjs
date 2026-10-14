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

function fixture(t, behavior = '') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'jovie-codex-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'bin'));
  writeFileSync(join(root, '.nvmrc'), process.versions.node);
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ packageManager: 'pnpm@9.15.9' })
  );
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'preserve lock');
  writeFileSync(join(root, '.env.local'), 'preserve environment');
  writeFileSync(
    join(root, 'bin/pnpm'),
    `#!/bin/bash
set -eu
if [[ "$*" == '--version' ]]; then
  ${behavior || "echo '9.15.9'"}
  exit 0
fi
printf '%s\\n' "$PWD" "$*" "$PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD" "$ONNXRUNTIME_NODE_INSTALL" > "$PWD/install-receipt"
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
    `${root}\ninstall --frozen-lockfile --prefer-offline\n1\nskip\n`
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

test('secret-free SessionStart uses the dependency lane and emits valid hook JSON from any cwd', t => {
  const { root, env } = fixture(t);
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, 'nested'));
  mkdirSync(join(root, 'scripts/hooks'));
  writeFileSync(
    join(root, 'scripts/hooks/configure-git-hooks.sh'),
    '#!/bin/bash\nprintf configured > hook-configured\n'
  );
  for (const name of ['codex-setup.sh', 'codex-cloud-setup.mjs'])
    copyFileSync(resolve('scripts', name), join(root, 'scripts', name));
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
