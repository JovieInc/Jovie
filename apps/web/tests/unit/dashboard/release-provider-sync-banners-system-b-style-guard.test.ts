import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const guardedSources = [
  'components/features/dashboard/organisms/release-provider-matrix/AppleMusicSyncBanner.tsx',
  'components/features/dashboard/organisms/release-provider-matrix/ImportProgressBanner.tsx',
] as const;

const forbiddenVisualPatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /\bcolor-mix\(/,
  /\b(?:rounded|shadow)-\[/,
] as const;

describe('release provider sync banner System B source contract', () => {
  it('keeps provider banner styling on named System B primitives', () => {
    for (const sourcePath of guardedSources) {
      const source = readFileSync(resolve(process.cwd(), sourcePath), 'utf8');

      for (const pattern of forbiddenVisualPatterns) {
        expect(source, `${sourcePath} matched ${pattern}`).not.toMatch(pattern);
      }

      expect(source).toContain('system-b-release-provider-banner');
      expect(source).toContain('system-b-release-provider-banner--');
    }
  });
});
