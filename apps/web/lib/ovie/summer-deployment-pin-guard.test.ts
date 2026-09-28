import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..'
);

describe('Summer deployment pin guard', () => {
  it('fails the repository when a Summer deployment pin is present', () => {
    const result = spawnSync(
      process.execPath,
      ['--test', 'scripts/summer-deployment-pin-guard.test.mjs'],
      { cwd: repoRoot, encoding: 'utf8' }
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('finds no Summer deployment pin');
  });
});
