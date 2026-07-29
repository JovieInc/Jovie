import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '..', '..', '..');
const wrapper = resolve(repoRoot, 'scripts/typecheck-singleflight.mjs');
const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function runWrapper(stateDir, marker) {
  const script =
    "const fs=require('node:fs');" +
    "fs.appendFileSync(process.argv[1], 'owner\\n');" +
    'setTimeout(() => process.exit(0), 700);';
  return new Promise(resolveRun => {
    const child = spawn(
      process.execPath,
      [wrapper, '--', process.execPath, '-e', script, marker],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          TYPECHECK_SINGLEFLIGHT_DIR: stateDir,
          TYPECHECK_SINGLEFLIGHT_POLL_MS: '25',
          TYPECHECK_SINGLEFLIGHT_STALE_MS: '100',
          TYPECHECK_SINGLEFLIGHT_REUSE_WINDOW_MS: '5000',
        },
        stdio: 'ignore',
      }
    );
    child.once('exit', code => resolveRun(code));
  });
}

describe('typecheck singleflight', () => {
  it('never evicts a live owner solely because its lock is old', async () => {
    const stateDir = mkdtempSync(resolve(tmpdir(), 'jovie-singleflight-'));
    temporaryDirectories.push(stateDir);
    const marker = resolve(stateDir, 'owners.txt');

    const first = runWrapper(stateDir, marker);
    await new Promise(resolveWait => setTimeout(resolveWait, 250));
    const second = runWrapper(stateDir, marker);

    expect(await Promise.all([first, second])).toEqual([0, 0]);
    expect(readFileSync(marker, 'utf8').trim().split('\n')).toEqual(['owner']);
  });
});
