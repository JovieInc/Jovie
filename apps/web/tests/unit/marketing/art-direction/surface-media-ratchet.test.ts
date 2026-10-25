import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../../'
);

describe('marketing surface media', () => {
  it('scopes canvas, WebGL, and video and allows the homepage hero', () => {
    const check = readFileSync(
      join(REPO_ROOT, 'scripts/invariants/art-direction/surface-media.mjs'),
      'utf8'
    );
    expect(check).toContain('apps/web/components/homepage/hero-light/');
    expect(check).not.toContain('NIGHT_DJ_HARMONY_V1_ENABLED');
    const result = spawnSync(
      'node',
      ['--test', 'scripts/invariants/art-direction/surface-media.test.mjs'],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });
});
