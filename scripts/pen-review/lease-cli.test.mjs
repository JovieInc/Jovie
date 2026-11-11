import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

test('manual lease token renews across CLI PIDs while wrong owners cannot renew, save or release', t => {
  const dir = mkdtempSync(join(tmpdir(), 'pen-manual-lease-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const cli = (...args) =>
    spawnSync(
      process.execPath,
      [fileURLToPath(new URL('./run.mjs', import.meta.url)), ...args],
      {
        env: { ...process.env, PEN_REVIEW_STATE: dir },
        encoding: 'utf8',
      }
    );
  const acquired = cli('lease', 'acquire', '--holder', 'manual');
  assert.equal(acquired.status, 0, acquired.stderr);
  const initial = JSON.parse(acquired.stdout).lease;
  assert.match(initial.token, /^[0-9a-f-]{36}$/);
  assert.equal(statSync(join(dir, 'writer.lease.json')).mode & 0o777, 0o600);
  assert.equal(cli('lease', 'acquire', '--holder', 'manual').status, 3);
  assert.equal(
    cli('lease', 'acquire', '--holder', 'manual', '--token', 'wrong').status,
    3
  );
  assert.equal(cli('save', '--holder', 'manual', '--token', 'wrong').status, 3);
  assert.equal(
    cli('lease', 'release', '--holder', 'manual', '--token', 'wrong').status,
    3
  );
  const renewed = cli(
    'lease',
    'acquire',
    '--holder',
    'manual',
    '--token',
    initial.token
  );
  assert.equal(renewed.status, 0, renewed.stderr);
  const current = JSON.parse(renewed.stdout);
  assert.equal(current.renewed, true);
  assert.notEqual(current.lease.pid, initial.pid);
  assert.equal(
    cli('lease', 'release', '--holder', 'manual', '--token', initial.token)
      .status,
    0
  );
});
