import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const sourcePath = join(appRoot, 'app/not-found.tsx');
const marketingSystemPath = join(
  appRoot,
  'components/marketing/artist-profile/ArtistProfileLandingPage.css'
);
const publicThemeBridgePath = join(
  appRoot,
  'components/marketing/MarketingSnapRail.css'
);
const rootNotFoundSystemPath = join(
  appRoot,
  'components/marketing/artist-profile/ShellCtaButton.css'
);

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

describe('root not-found System B source tokens', () => {
  it('renders the root not-found on the System B marketing wrapper, not System A', async () => {
    const source = await readFile(sourcePath, 'utf8');

    expect(source).toContain('system-b-marketing dark');
    expect(source).not.toContain('linear-marketing');
    expect(source).toContain(
      "import '../components/marketing/MarketingSnapRail.css';"
    );
    expect(source).toContain(
      "import '../components/marketing/artist-profile/ShellCtaButton.css';"
    );
    expect(source).not.toContain('ArtistProfileLandingPage.css');
  });

  it('keeps the route free of route-local visual token drift', async () => {
    const source = await readFile(sourcePath, 'utf8');

    expect(source).not.toMatch(hardcodedHashColorPattern);
    expect(source).not.toMatch(rawAlphaColorPattern);
    expect(source).not.toMatch(rawColorMixPattern);
    expect(source).not.toMatch(rawGradientPattern);
    expect(source).not.toMatch(rawVisualUtilityPattern);
    expect(source).not.toMatch(negativeTrackingPattern);
    expect(source).not.toContain('style={{');
    expect(source).toContain("variant='minimal'");
    expect(source).toContain('system-b-root-not-found-main');
    expect(source).toContain('NotFoundPageContent');
    expect(source).toContain("variant='generic'");
  });

  it('backs the root not-found primitives with System B tokens', async () => {
    const [css, marketingCss, publicThemeCss] = await Promise.all([
      readFile(rootNotFoundSystemPath, 'utf8'),
      readFile(marketingSystemPath, 'utf8'),
      readFile(publicThemeBridgePath, 'utf8'),
    ]);
    const block = css.match(/SYSTEM B ROOT NOT FOUND PRIMITIVES[\s\S]*$/)?.[0];

    expect(block).toBeTruthy();
    expect(css.match(/SYSTEM B ROOT NOT FOUND PRIMITIVES/g)).toHaveLength(1);
    expect(marketingCss).not.toContain('system-b-root-not-found');
    expect(publicThemeCss).toContain(
      'Shared System B public-page theme bridge'
    );
    expect(publicThemeCss).toContain('.system-b-marketing {');
    expect(block).toContain('var(--system-b-header-height)');
    expect(block).toContain('var(--system-b-text-primary)');
    expect(block).toContain('var(--system-b-primary-bg)');
    expect(block).toContain('var(--system-b-primary-fg)');
    expect(block).toContain('system-b-root-not-found-actions');
    expect(block).toContain('system-b-root-not-found-action-secondary');
    expect(block).toContain('var(--space-16)');
    expect(block).not.toMatch(hardcodedHashColorPattern);
    expect(block).not.toMatch(rawAlphaColorPattern);
    expect(block).not.toMatch(rawColorMixPattern);
    expect(block).not.toMatch(rawGradientPattern);
    expect(block).not.toContain('--linear-');
  });

  it('keeps the decorative root not-found code contrast stable', async () => {
    const css = await readFile(rootNotFoundSystemPath, 'utf8');
    const codeBlock = css.match(
      /:where\(\.system-b-root-not-found-code\) \{[\s\S]*?\n\}/
    )?.[0];

    expect(codeBlock).toBeTruthy();
    expect(codeBlock).toContain('color: var(--color-text-quaternary-token);');
    expect(codeBlock).not.toContain('opacity:');
  });
});
