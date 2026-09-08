import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Run only the packaged output, with neither source identity files nor credentials.
const identity = process.argv[2];
assert.ok(['jovie', 'summer'].includes(identity));
const directory = mkdtempSync(join(tmpdir(), 'eve-built-proof-'));
let child;
try {
  cpSync(resolve('.output'), join(directory, 'output'), {
    recursive: true,
    dereference: true,
  });
  child = spawn(
    process.execPath,
    [join(directory, 'output/server/index.mjs')],
    {
      cwd: directory,
      env: { PATH: process.env.PATH, HOST: '127.0.0.1', PORT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  const origin = await new Promise((resolveOrigin, reject) => {
    const timer = setTimeout(
      () => reject(new Error('packaged startup timed out')),
      15000
    );
    let output = '';
    child.once('error', reject);
    child.once('exit', () => {
      clearTimeout(timer);
      reject(new Error('packaged runtime exited'));
    });
    const read = chunk => {
      output += chunk.toString();
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/u);
      if (match) {
        clearTimeout(timer);
        resolveOrigin(match[0]);
      }
    };
    child.stdout.on('data', read);
    child.stderr.on('data', read);
  });
  const response = await fetch(`${origin}/runtime/v1/health`, {
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    identity,
    status: 'uncommissioned',
    instructionsAvailable: true,
  });
  if (identity === 'summer') {
    const forbidden = await fetch(`${origin}/eve/v1/session`, {
      method: 'POST',
      body: '{}',
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(forbidden.status, 404);
  }
  console.log(
    JSON.stringify({ identity, builtOutput: 'passed', commissioned: false })
  );
} finally {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await new Promise(resolveExit => child.once('exit', resolveExit));
  }
  rmSync(directory, { recursive: true, force: true });
}
