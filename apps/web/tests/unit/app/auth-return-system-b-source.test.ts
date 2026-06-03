import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const sourcePaths = [
  'app/auth-return/page.tsx',
  'app/mobile-auth-return/page.tsx',
] as const;

const hashMark = String.fromCharCode(35);
const colorFunctionName = ['r', 'g', 'b', 'a'].join('');
const hardcodedHashColorPattern = new RegExp(`${hashMark}[\\da-fA-F]{3,8}\\b`);
const rawAlphaColorPattern = new RegExp(`${colorFunctionName}\\s*\\(`, 'i');
const rawColorMixPattern = /color-mix\(/i;
const gradientPattern = ['linear', 'gradient|radial', 'gradient'].join('-');
const rawGradientPattern = new RegExp(gradientPattern, 'i');
const rawVisualUtilityPattern =
  /\b(?:bg|border|text|ring|shadow|outline|rounded|h|w|max-w|min-h|min-w|tracking|leading|px|py|pt|pb)-\[/;
const directWhiteBlackUtilityPattern =
  /\b(?:bg|border|text|ring|shadow)-(?:white|black)(?:\/|\b)/;
const positionalMotionPattern = /\b(?:active:|hover:)?(?:scale-|translate-)/;

describe('Auth return System B source tokens', () => {
  it('keeps auth return fallbacks free of raw visual token drift', async () => {
    for (const sourcePath of sourcePaths) {
      const source = await readFile(join(appRoot, sourcePath), 'utf8');

      expect(source, sourcePath).not.toMatch(hardcodedHashColorPattern);
      expect(source, sourcePath).not.toMatch(rawAlphaColorPattern);
      expect(source, sourcePath).not.toMatch(rawColorMixPattern);
      expect(source, sourcePath).not.toMatch(rawGradientPattern);
      expect(source, sourcePath).not.toMatch(rawVisualUtilityPattern);
      expect(source, sourcePath).not.toMatch(directWhiteBlackUtilityPattern);
      expect(source, sourcePath).not.toMatch(positionalMotionPattern);
      expect(source, sourcePath).toContain('bg-base');
      expect(source, sourcePath).toContain('bg-btn-primary');
      expect(source, sourcePath).toContain('text-btn-primary-foreground');
      expect(source, sourcePath).toContain('focus-ring-transparent-offset');
    }
  });
});
