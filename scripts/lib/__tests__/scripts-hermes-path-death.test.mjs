import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../../..');
const DEAD = ['scripts', 'hermes'].join('/');

function citations() {
  const result = spawnSync(
    'git',
    ['grep', '-n', '-I', DEAD, '--', ':(exclude)CHANGELOG.md'],
    { cwd: ROOT, encoding: 'utf8' }
  );
  if (result.status === 1) return [];
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout
    .trim()
    .split('\n')
    .filter(line => line && !line.includes(`${DEAD}-cli`));
}

describe('JOV-5973 path death', () => {
  it('keeps the retired package directory gone', () => {
    expect(existsSync(join(ROOT, 'scripts', 'hermes'))).toBe(false);
    expect(existsSync(join(ROOT, 'scripts', 'symphony'))).toBe(true);
  });

  it('has no live package-path citations', () => {
    expect(citations()).toEqual([]);
  });
});
