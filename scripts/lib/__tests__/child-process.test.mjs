import * as node from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  execFileSync,
  execSync,
  MAX_BUFFER,
  spawnSync,
  withMaxBuffer,
} from '../child-process.mjs';

const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

// A repo whose `git ls-files` prints more than Node's 1 MiB default buffer.
function bigTree() {
  const dir = mkdtempSync(join(tmpdir(), 'child-process-'));
  dirs.push(dir);
  node.execFileSync('git', ['init', '-q'], { cwd: dir });
  const blob = node
    .execFileSync('git', ['hash-object', '-w', '--stdin'], {
      cwd: dir,
      input: '',
    })
    .toString()
    .trim();
  const segment = 'd'.repeat(240);
  const index = Array.from(
    { length: 5000 },
    (_, i) => `100644 ${blob}\t${segment}/${segment}/file-${i}.txt`
  ).join('\n');
  node.execFileSync('git', ['update-index', '--index-info'], {
    cwd: dir,
    input: index,
  });
  return dir;
}

describe('buffered child_process', () => {
  it('reads a git listing past the 1 MiB default that node:child_process rejects', () => {
    const cwd = bigTree();
    expect(() =>
      node.execFileSync('git', ['ls-files'], { cwd, encoding: 'utf8' })
    ).toThrow(/ENOBUFS/);

    const listed = execFileSync('git', ['ls-files'], { cwd, encoding: 'utf8' });
    expect(listed.length).toBeGreaterThan(1024 * 1024);
    expect(listed.trim().split('\n')).toHaveLength(5000);

    const spawned = spawnSync('git', ['ls-files'], { cwd, encoding: 'utf8' });
    expect(spawned.error).toBeUndefined();
    expect(spawned.stdout.trim().split('\n')).toHaveLength(5000);

    expect(execSync('git ls-files', { cwd, encoding: 'utf8' }).length).toBe(
      listed.length
    );
  });

  it('keeps a caller maxBuffer and accepts options in place of args', () => {
    expect(withMaxBuffer({ maxBuffer: 10, cwd: '/x' })).toEqual({
      maxBuffer: 10,
      cwd: '/x',
    });
    expect(withMaxBuffer(undefined)).toEqual({ maxBuffer: MAX_BUFFER });
    expect(withMaxBuffer({ encoding: 'utf8' })).toEqual({
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
    });
    expect(execFileSync('node', { encoding: 'utf8', input: '' })).toBe('');
    expect(
      spawnSync('node', ['-e', 'process.stdout.write("ok")'], {
        encoding: 'utf8',
      }).stdout
    ).toBe('ok');
  });
});
