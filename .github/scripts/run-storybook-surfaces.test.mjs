import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const script = new URL('./run-storybook-surfaces.sh', import.meta.url).pathname;
function run(
  shard,
  commandStatus = 0,
  serverAlive = true,
  fromToolRoot = false
) {
  const root = mkdtempSync(join(tmpdir(), 'mq-storybook-'));
  try {
    mkdirSync(join(root, 'apps/web'), { recursive: true });
    const bin = join(root, 'bin');
    mkdirSync(bin);
    const commands = join(root, 'commands');
    for (const [name, body] of [
      ['curl', 'exit 0'],
      ['node', 'printf "%s\\n" "$@" > "$COMMAND_LOG"; exit "$COMMAND_STATUS"'],
    ])
      writeFileSync(join(bin, name), `#!/bin/bash\n${body}\n`, { mode: 0o755 });
    const bashEnv = join(root, 'bash-env');
    writeFileSync(bashEnv, `kill() { return ${serverAlive ? 0 : 1}; }\n`);
    const result = spawnSync('/bin/bash', [script], {
      cwd: fromToolRoot ? bin : root,
      encoding: 'utf8',
      timeout: 5_000,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        BASH_ENV: bashEnv,
        GITHUB_WORKSPACE: root,
        RUNNER_TEMP: root,
        STORYBOOK_PID: '123',
        STORYBOOK_SHARD: shard,
        COMMAND_LOG: commands,
        COMMAND_STATUS: String(commandStatus),
      },
    });
    return {
      status: result.status,
      output: result.stdout + result.stderr,
      commands: serverAlive ? readFileSync(commands, 'utf8') : '',
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
test('every browser shard runs the full surface spec list with the existing worker and config flags', () => {
  for (const shard of ['1', '2', '3']) {
    const result = run(shard);
    assert.equal(result.status, 0, result.output);
    assert.match(result.commands, new RegExp(`--shard=${shard}/3`));
    assert.match(result.commands, /--workers=2/);
    assert.match(result.commands, /--config=playwright.config.storybook.ts/);
    assert.match(result.commands, /storybook-elevation.spec.ts/);
    assert.match(result.commands, /storybook-overlay-collisions.spec.ts/);
    assert.match(result.commands, /guard-playwright-artifacts.mjs/);
    assert.equal(result.commands.match(/tests\/e2e\/.*\.spec\.ts/g).length, 24);
  }
});
test('the MQ certification leg still calls its merged-tree certification helper', () => {
  const result = run('certification');
  assert.equal(result.status, 0, result.output);
  assert.match(result.commands, /component-merge-group-storybook-cert.mjs/);
  assert.doesNotMatch(result.commands, /playwright/);
});
test('test failures and a dead Storybook server fail closed', () => {
  assert.equal(run('2', 7).status, 7);
  const dead = run('1', 0, false);
  assert.equal(dead.status, 1);
  assert.match(dead.output, /Storybook dev server died/);
});

test('a trusted tool snapshot still runs against the source workspace', () => {
  const result = run('1', 0, true, true);
  assert.equal(result.status, 0, result.output);
  assert.match(result.commands, /storybook-elevation.spec.ts/);
});
