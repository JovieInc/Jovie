import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const sourcePath = join(appRoot, 'app/[username]/not-found.tsx');
const designSystemPath = join(appRoot, 'styles/design-system.css');

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

describe('public profile not-found System B source tokens', () => {
  it('keeps the route free of route-local visual token drift', async () => {
    const source = await readFile(sourcePath, 'utf8');

    expect(source).not.toMatch(hardcodedHashColorPattern);
    expect(source).not.toMatch(rawAlphaColorPattern);
    expect(source).not.toMatch(rawColorMixPattern);
    expect(source).not.toMatch(rawGradientPattern);
    expect(source).not.toMatch(rawVisualUtilityPattern);
    expect(source).not.toMatch(negativeTrackingPattern);
    expect(source).not.toContain('style={{');
    expect(source).toContain("headerVariant='minimal'");
    expect(source).toContain('system-b-public-profile-not-found-main');
    expect(source).toContain('NotFoundPageContent');
    expect(source).toContain('resolveNotFoundVariant');
    expect(source).toContain('resolveNotFoundPathname');
  });

  it('backs the public profile not-found primitives with System B profile tokens', async () => {
    const css = await readFile(designSystemPath, 'utf8');
    const block = css.match(
      /SYSTEM B PUBLIC PROFILE NOT FOUND PRIMITIVES[\s\S]*?\/\* ============================================\s+SYSTEM B UNAVAILABLE PAGE PRIMITIVES/
    )?.[0];

    expect(block).toBeTruthy();
    expect(block).toContain('var(--profile-stage-bg)');
    expect(block).toContain('var(--profile-stage-overlay)');
    expect(block).toContain('var(--system-b-header-height)');
    expect(block).toContain('var(--system-b-text-primary)');
    expect(block).toContain('var(--profile-pearl-primary-bg)');
    expect(block).toContain('var(--profile-pearl-primary-fg)');
    expect(block).toContain('system-b-public-profile-not-found-actions');
    expect(block).toContain(
      'system-b-public-profile-not-found-action-secondary'
    );
    expect(block).toContain('var(--space-16)');
    expect(block).not.toMatch(hardcodedHashColorPattern);
    expect(block).not.toMatch(rawAlphaColorPattern);
    expect(block).not.toMatch(rawColorMixPattern);
    expect(block).not.toMatch(rawGradientPattern);
    expect(block).not.toContain('--linear-');
  });
});
