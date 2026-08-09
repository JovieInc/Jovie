import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readWebSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('support route header contract', () => {
  it('keeps support in the canonical landing header taxonomy', () => {
    const headerSource = readWebSource('components/site/MarketingHeader.tsx');
    const registrySource = readWebSource('lib/sections/variants/header.tsx');
    const landingStart = registrySource.indexOf(
      "id: 'marketing-header-landing'"
    );
    const minimalStart = registrySource.indexOf(
      "id: 'marketing-header-minimal'"
    );
    const landingRegistration = registrySource.slice(
      landingStart,
      minimalStart
    );

    expect(headerSource).not.toMatch(/\|\s*'content'/);
    expect(registrySource).not.toContain('marketing-header-content');
    expect(landingStart).toBeGreaterThanOrEqual(0);
    expect(minimalStart).toBeGreaterThan(landingStart);
    for (const route of ['/blog', '/blog/[slug]', '/changelog', '/support']) {
      expect(
        landingRegistration,
        `${route} must use the landing header`
      ).toContain(`'${route}'`);
    }
  });

  it('inherits landing from the shared marketing shell and shell story', () => {
    const marketingLayout = readWebSource('app/(marketing)/layout.tsx');
    const publicPageShell = readWebSource(
      'components/site/PublicPageShell.tsx'
    );
    const shellStories = readWebSource(
      'components/marketing/storybook/MarketingShells.stories.tsx'
    );
    const headerStoryStart = shellStories.indexOf(
      'export const MarketingHeaderDefault'
    );
    const footerStoryStart = shellStories.indexOf(
      'export const MarketingFooterDefault'
    );
    const headerStory = shellStories.slice(headerStoryStart, footerStoryStart);

    expect(marketingLayout).toContain('<PublicPageShell');
    expect(marketingLayout).not.toContain('headerVariant=');
    expect(publicPageShell).toContain("headerVariant = 'landing'");
    expect(headerStoryStart).toBeGreaterThanOrEqual(0);
    expect(footerStoryStart).toBeGreaterThan(headerStoryStart);
    expect(headerStory).toContain("<MarketingHeader variant='landing' />");
  });
});
