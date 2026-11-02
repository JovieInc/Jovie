import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../../'
);

describe('approved people registry', () => {
  it('fails CI on any person image that is not registered with consent and provenance', () => {
    const result = spawnSync(
      'node',
      ['--test', 'scripts/invariants/art-direction/people.test.mjs'],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });
});
