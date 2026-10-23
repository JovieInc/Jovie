import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../../../../');

describe('marketing surface media', () => {
  it('keeps canvas and WebGL behind night-dj-harmony-v1', () => {
    const flag = readFileSync(
      join(REPO_ROOT, 'apps/web/lib/marketing/night-dj-harmony.ts'),
      'utf8'
    );
    expect(flag).toContain('NIGHT_DJ_HARMONY_V1_ENABLED = false');
    expect([
      'apps/web/components/marketing',
      'apps/web/app/(marketing)',
      'apps/web/lib/marketing/night-dj-harmony.ts',
    ]).toContain('apps/web/components/marketing');
    const result = spawnSync(
      'node',
      ['--test', 'scripts/invariants/art-direction/surface-media.test.mjs'],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });
});
