import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildArtifacts } from './generate';

/**
 * Schema-drift guard: committed generated artifacts must match what the
 * manifest regenerates, byte-for-byte. Regenerate with:
 *   pnpm --filter @jovie/action-contracts run generate
 */
describe('generated artifact parity', () => {
  const artifacts = buildArtifacts();

  it('produces a deterministic artifact set', () => {
    const first = buildArtifacts();
    const second = buildArtifacts();
    expect(second).toEqual(first);
    expect(Object.keys(first).length).toBeGreaterThan(0);
  });

  it('committed artifacts match regeneration exactly', () => {
    const drifted: string[] = [];
    for (const [relativePath, expected] of Object.entries(artifacts)) {
      const absolutePath = join(import.meta.dirname, 'generated', relativePath);
      if (!existsSync(absolutePath)) {
        drifted.push(`${relativePath} (missing)`);
        continue;
      }
      const actual = readFileSync(absolutePath, 'utf8');
      if (actual !== expected) {
        drifted.push(relativePath);
      }
    }
    expect(drifted).toEqual([]);
  });

  it('every artifact is valid JSON', () => {
    for (const [relativePath, contents] of Object.entries(artifacts)) {
      expect(() => JSON.parse(contents), relativePath).not.toThrow();
    }
  });
});
