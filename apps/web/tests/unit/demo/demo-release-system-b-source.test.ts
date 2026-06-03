import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const demoReleaseSources = [
  'components/features/demo/DemoReleaseLandingSurface.tsx',
  'components/features/demo/DemoReleaseDetail.tsx',
  'components/features/demo/mock-release-data.ts',
] as const;

const duplicatedProviderAccentPatterns = [
  /PROVIDER_ACCENTS/,
  /PROVIDER_COLORS/,
  /DEFAULT_PROVIDER_ACCENT/,
  /#[0-9a-fA-F]{3,8}/,
] as const;

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('demo release System B source contract', () => {
  it('keeps demo release provider accents on the canonical provider config', () => {
    for (const sourcePath of demoReleaseSources) {
      const source = readFileSync(resolve(webRoot, sourcePath), 'utf8');

      for (const pattern of duplicatedProviderAccentPatterns) {
        expect(source, `${sourcePath} matched ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
