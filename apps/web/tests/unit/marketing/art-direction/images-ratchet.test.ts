import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../../'
);

describe('marketing image plates', () => {
  it('requires a smooth plate, one accent sidecar, and no generated-ui', () => {
    const plate =
      'apps/web/public/assets/generated/homepage-hero-technical-texture-v1.webp';
    const sidecar = readFileSync(`${join(REPO_ROOT, plate)}.meta.json`, 'utf8');
    expect(sidecar).toContain('"accent": "ion"');
    expect(sidecar).not.toContain('generated-ui');
    const result = spawnSync(
      'node',
      ['--test', 'scripts/invariants/art-direction/images.test.mjs'],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });
});
