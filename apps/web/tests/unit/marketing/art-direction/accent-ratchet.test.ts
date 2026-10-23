import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../../'
);

const SURFACES = [
  'apps/web/app/(marketing)',
  'apps/web/app/(home)',
  'apps/web/components/marketing',
  'apps/web/components/homepage',
  'scripts/invariants/art-direction/accent.baseline.json',
  'design.tokens.json',
] as const;

describe('marketing accent ratchet', () => {
  it('scans marketing sections and only shrinks the baseline', () => {
    expect(SURFACES).toContain('apps/web/app/(marketing)');
    const baseline = JSON.parse(
      readFileSync(join(REPO_ROOT, SURFACES[4]), 'utf8')
    ) as { ids: string[] };
    expect(baseline.ids.length).toBeGreaterThan(0);
    const result = spawnSync(
      'node',
      [
        '--input-type=module',
        '-e',
        "import { checkAccent } from './scripts/invariants/art-direction/accent.mjs'; const result = checkAccent(); if (result.failures.length) { console.error(result.failures.join('\\n')); process.exit(1); }",
      ],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });
});
