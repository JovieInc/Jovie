import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../../'
);

describe('hero scroll ratchet', () => {
  it('rejects scroll hijacking under apps/web/components/marketing', () => {
    const surfaces = [
      'apps/web/components/marketing',
      'apps/web/app/(home)',
      'scripts/invariants/art-direction/hero-scroll.test.mjs',
    ];
    expect(surfaces).toContain('apps/web/components/marketing');
    const result = spawnSync('node', ['--test', surfaces[2]], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });
});
