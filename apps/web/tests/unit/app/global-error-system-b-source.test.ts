import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const sourcePath = join(appRoot, 'app/global-error.tsx');

const hashMark = String.fromCharCode(35);
const colorFunctionName = ['r', 'g', 'b', 'a'].join('');
const hardcodedHashColorPattern = new RegExp(`${hashMark}[\\da-fA-F]{3,8}\\b`);
const rawAlphaColorPattern = new RegExp(`${colorFunctionName}\\s*\\(`, 'i');
const rawColorMixPattern = /color-mix\(/i;
const gradientPattern = ['linear', 'gradient|radial', 'gradient'].join('-');
const rawGradientPattern = new RegExp(gradientPattern, 'i');
const rawVisualUtilityPattern =
  /\b(?:bg|border|text|ring|shadow|outline|rounded|h|w|max-w|min-h|min-w|tracking|leading|px|py|pt|pb)-\[/;
const negativeTrackingPattern = /\btracking-(?:tight|tighter)\b/;
const positionalMotionPattern = /\b(?:active:)?scale-|transform:\s*scale/i;
const hardcodedSvgFillPattern = new RegExp(
  `fill=(['"])${hashMark}[\\da-fA-F]{3,8}\\1`
);

describe('Global error System B source tokens', () => {
  it('keeps the fallback free of raw color literals', async () => {
    const source = await readFile(sourcePath, 'utf8');

    expect(source).not.toMatch(hardcodedHashColorPattern);
    expect(source).not.toMatch(rawAlphaColorPattern);
    expect(source).not.toMatch(rawColorMixPattern);
    expect(source).not.toMatch(rawGradientPattern);
    expect(source).not.toMatch(rawVisualUtilityPattern);
    expect(source).not.toMatch(negativeTrackingPattern);
    expect(source).not.toMatch(positionalMotionPattern);
    expect(source).not.toMatch(hardcodedSvgFillPattern);
    expect(source).not.toContain('--global-error');
    expect(source).not.toContain('dangerouslySetInnerHTML');
    expect(source).not.toContain('biome-ignore');
    expect(source).toContain("import './globals.css';");
    expect(source).toContain("className='dark'");
    expect(source).toContain('SystemBErrorFallback');
    expect(source).toContain('system-b-error-fallback-body');
    expect(source).not.toContain('focus-ring-transparent-offset');
  });
});
