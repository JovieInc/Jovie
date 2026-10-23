import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../../../../');
const ROOTS = [
  'apps/web/app/(marketing)',
  'apps/web/components/marketing',
  'design.tokens.json',
  'scripts/invariants/art-direction/hue.test.mjs',
] as const;

describe('marketing hue ratchet', () => {
  it('fails orange hues and literal triads outside the baseline', () => {
    expect(ROOTS[0]).toBe('apps/web/app/(marketing)');
    expect(readFileSync(join(REPO_ROOT, 'design.tokens.json'), 'utf8')).toContain('{');
    const result = spawnSync(
      'node',
      ['--test', 'scripts/invariants/art-direction/hue.test.mjs'],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });
});
