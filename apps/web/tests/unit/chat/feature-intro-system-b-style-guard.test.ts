import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const guardedSources = [
  'components/jovie/components/FeatureIntroCard.tsx',
  'components/jovie/feature-intro-catalog.ts',
] as const;

const forbiddenLocalChromePatterns = [
  /--linear-/,
  /--geist-cyan/,
  /\bcolor-mix\(/,
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient|bg-gradient/,
  /\b(?:bg|border|hover:bg|hover:text|focus-within:ring|focus-visible:ring)-\[/,
  /\btext-\[color:/,
  /\bshadow-\[/,
] as const;

describe('feature intro System B source contract', () => {
  it('keeps the chat-home card on named System B primitives', () => {
    for (const sourcePath of guardedSources) {
      const source = readFileSync(resolve(appRoot, sourcePath), 'utf8');

      for (const pattern of forbiddenLocalChromePatterns) {
        expect(source, `${sourcePath} matched ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('reuses the canonical Card and Button instead of a second banner system', () => {
    const source = readFileSync(
      resolve(appRoot, 'components/jovie/components/FeatureIntroCard.tsx'),
      'utf8'
    );
    expect(source).toContain("from '@jovie/ui'");
    expect(source).toContain('<Card');
    expect(source).toContain("variant='primary'");
    expect(source).not.toContain('InstallBanner');
  });
});
