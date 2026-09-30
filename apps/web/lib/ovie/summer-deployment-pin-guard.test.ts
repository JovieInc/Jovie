import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..'
);

describe('Summer deployment pin guard', () => {
  it('rejects deployment pins while allowing stable and historical references', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--test',
        '--test-name-pattern',
        'rejects a per-deployment|allows a historical',
        'scripts/summer-deployment-pin-guard.test.mjs',
      ],
      { cwd: repoRoot, encoding: 'utf8' }
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('rejects a per-deployment Summer URL');
    expect(result.stdout).toContain('allows a historical incident line');
    expect(result.stdout).toMatch(/\bpass 2\b/u);
  });
});
