import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const sourcePath = join(appRoot, 'app/error.tsx');

const hashMark = String.fromCharCode(35);
const colorFunctionName = ['r', 'g', 'b', 'a'].join('');
const hardcodedHashColorPattern = new RegExp(`${hashMark}[\\da-fA-F]{3,8}\\b`);
const rawAlphaColorPattern = new RegExp(`${colorFunctionName}\\s*\\(`, 'i');
const gradientPattern = ['linear', 'gradient|radial', 'gradient'].join('-');
const rawGradientPattern = new RegExp(gradientPattern, 'i');
const rawVisualUtilityPattern =
  /\b(?:bg|border|text|ring|shadow|outline|rounded|h|w|max-w|min-h|min-w|tracking|leading|px|py|pt|pb)-\[/;
const negativeTrackingPattern = /\btracking-(?:tight|tighter)\b/;

describe('App error System B source tokens', () => {
  it('keeps the fallback free of raw visual token drift', async () => {
    const source = await readFile(sourcePath, 'utf8');

    expect(source).not.toMatch(hardcodedHashColorPattern);
    expect(source).not.toMatch(rawAlphaColorPattern);
    expect(source).not.toMatch(rawGradientPattern);
    expect(source).not.toMatch(rawVisualUtilityPattern);
    expect(source).not.toMatch(negativeTrackingPattern);
    expect(source).toContain('SystemBErrorFallback');
    expect(source).not.toContain("fill='currentColor'");
    expect(source).not.toContain('focus-ring-transparent-offset');
  });
});
