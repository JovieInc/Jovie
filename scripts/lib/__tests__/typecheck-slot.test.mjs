import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SLOT = fileURLToPath(
  new URL('../../typecheck-slot.mjs', import.meta.url)
);

function runSlot(env, argv) {
  return new Promise(resolve => {
    const child = spawn('node', [SLOT, '--', ...argv], {
      env: { ...process.env, ...env },
      stdio: 'ignore',
    });
    child.on('exit', code => resolve(code));
  });
}

// Each job appends + on start and - on end; peak concurrency is replayed from the log.
const job = log => [
  'node',
  '-e',
  `const f=require('fs');f.appendFileSync(${JSON.stringify(log)},'+\\n');setTimeout(()=>f.appendFileSync(${JSON.stringify(log)},'-\\n'),400)`,
];

function replay(log) {
  let live = 0;
  let peak = 0;
  let starts = 0;
  for (const line of readFileSync(log, 'utf8').trim().split('\n')) {
    live += line === '+' ? 1 : -1;
    starts += line === '+' ? 1 : 0;
    peak = Math.max(peak, live);
  }
  return { peak, starts };
}

test('n+1 concurrent callers queue behind n slots and all succeed', {
  skip: process.platform !== 'linux',
}, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'slots-'));
  const log = join(dir, 'log');
  const env = {
    GEM_TYPECHECK_SLOTS: '2',
    GEM_TYPECHECK_LOCK_DIR: dir,
    GEM_TYPECHECK_POLL_MS: '50',
  };
  const codes = await Promise.all([1, 2, 3].map(() => runSlot(env, job(log))));
  assert.deepEqual(codes, [0, 0, 0]);
  assert.deepEqual(replay(log), { peak: 2, starts: 3 });
});

test('exit codes pass through and an unset env does not throttle', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'slots-'));
  assert.equal(
    await runSlot({ GEM_TYPECHECK_SLOTS: '1', GEM_TYPECHECK_LOCK_DIR: dir }, [
      'node',
      '-e',
      'process.exit(3)',
    ]),
    3
  );
  const log = join(dir, 'log');
  const env = { GEM_TYPECHECK_SLOTS: '', GEM_TYPECHECK_LOCK_DIR: dir };
  await Promise.all([1, 2, 3].map(() => runSlot(env, job(log))));
  assert.equal(replay(log).peak, 3);
});
