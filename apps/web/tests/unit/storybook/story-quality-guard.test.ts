import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// tests/unit/storybook -> apps/web -> repo root (5 levels up from this file's dir)
const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../'
);
const guardPath = join(repoRoot, 'scripts/storybook-story-quality-guard.mjs');

describe('storybook story quality guard', () => {
  it('passes on the current product story library', () => {
    const output = execFileSync(process.execPath, [guardPath], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    expect(output).toContain('[story-quality] clean');
  });
});
