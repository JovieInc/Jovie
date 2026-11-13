import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { sh } from './preflight-changed.mjs';

test('preflight timeout stops a real host-slot child process group', {
  skip: process.platform === 'win32',
}, async context => {
  const directory = mkdtempSync(path.join(tmpdir(), 'preflight-slot-timeout-'));
  const pidFile = path.join(directory, 'slot-child.pid');
  const slotScript = path.resolve('scripts/typecheck-slot.mjs');
  const realTimeout = setTimeout;
  let pid;
  let stopped = false;
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let command;
  let timeoutFired = false;
  try {
    // Deliberately exceed the old wall-clock deadline before the child starts.
    command = sh(
      `sleep 0.6; node '${slotScript}' -- bash -c 'echo $$ > "$1.tmp"; mv "$1.tmp" "$1"; exec sleep 30' _ '${pidFile}'`,
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          GEM_TYPECHECK_SLOTS: '1',
          GEM_TYPECHECK_SLOT_HELD: '0',
          GEM_TYPECHECK_LOCK_DIR: directory,
        },
        timeoutMs: 500,
      }
    );
    const startedDeadline = Date.now() + 4000;
    while (!existsSync(pidFile) && Date.now() < startedDeadline)
      await new Promise(resolve => realTimeout(resolve, 20));
    assert.ok(existsSync(pidFile), 'host-slot child must start');
    pid = Number(readFileSync(pidFile, 'utf8'));
    assert.ok(Number.isInteger(pid) && pid > 0, 'child must publish its PID');
    context.mock.timers.tick(499);
    process.kill(pid, 0); // Still alive before the unchanged timeout boundary.
    context.mock.timers.tick(1);
    timeoutFired = true;
    context.mock.timers.reset();
    const result = await command;
    assert.equal(result.code, 124, 'the timeout must terminate the command');
    const deadline = Date.now() + 1000;
    while (!stopped && Date.now() < deadline) {
      try {
        process.kill(pid, 0);
        if (process.platform === 'linux') {
          stopped =
            readFileSync(`/proc/${pid}/stat`, 'utf8').split(' ')[2] === 'Z';
        }
      } catch (error) {
        if (error.code !== 'ESRCH' && error.code !== 'ENOENT') throw error;
        stopped = true;
      }
      if (!stopped) await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(
      stopped,
      true,
      'slot descendant must stop after preflight timeout'
    );
  } finally {
    if (!timeoutFired) context.mock.timers.tick(500);
    context.mock.timers.reset();
    if (command) await command;
    if (!pid && existsSync(pidFile))
      pid = Number(readFileSync(pidFile, 'utf8'));
    if (pid && !stopped) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {}
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
