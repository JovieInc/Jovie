import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readWebSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('support route header contract', () => {
  it('keeps support in the canonical landing header taxonomy', () => {
    const headerSource = readWebSource('components/site/MarketingHeader.tsx');
    expect(
      readFileSync(
        resolve(process.cwd(), 'components/site/MarketingHeader.tsx'),
        'utf8'
      )
    ).toContain('export function MarketingHeader');
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
    expect(headerSource).toContain(
      'penContractId={MARKETING_PEN_CONTRACT_IDS.shell.header}'
    );
    expect(headerSource).toContain('getHomepageFrontDoorCtaContract');
    expect(headerSource).toContain(
      'getHomepageFrontDoorCtaContract(FEATURE_FLAGS.WAITLIST_ENABLED).primary'
    );
    // Homepage conversion lock (JOV-5085): / shows Find yourself -> /start
    // even while waitlisting; other routes keep the front-door CTA.
    expect(headerSource).toContain(
      "[APP_ROUTES.HOME]: { label: 'Find yourself', href: APP_ROUTES.START }"
    );
    expect(headerSource).toContain("treatment: 'wordmark'");
    expect(headerSource).toContain('MARKETING_NAV_LINKS.map');
    // Canonical Pen header: the Customers flyout is the only glass flyout.
    expect(headerSource).toContain(
      'const MARKETING_GLASS_FLYOUT_MENUS: readonly HeaderFlyoutMenu[] = [\n  MARKETING_CUSTOMERS_FLYOUT,\n];'
    );
    expect(headerSource).toContain(
      'flyoutMenus: MARKETING_GLASS_FLYOUT_MENUS,'
    );
    expect(headerSource).not.toContain('MARKETING_GLASS_FLYOUTS');
    expect(headerSource).not.toContain('MARKETING_NAV_UTILITIES');
    expect(headerSource).toContain('showContactLink={false}');
    expect(headerSource).toContain("import './MarketingHeader.css'");
    expect(headerSource).toContain("presentation === 'marketing-glass'");
    expect(headerSource).toContain("? 'sm'");
    expect(headerSource).toContain('marketing-header-growth-space');
    expect(headerSource).toContain('ResizeObserver');
    // Icon-only brand comes from explicit per-page config, never DOM text.
    expect(headerSource).toContain(
      'resolveMarketingHeaderBrand(pathname, brand)'
    );
    expect(headerSource).toContain(
      "logoReveal={resolvedLogoVariant === 'icon'}"
    );
    expect(headerSource).not.toMatch(
      /textContent|innerText|querySelector\('h1/
    );
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

  it('keeps public sign-in copy and the shared front-door CTA contract', () => {
    const headerSource = readWebSource('components/site/MarketingHeader.tsx');

    expect(headerSource).toContain(
      'const useCanonicalSimpleNav = isHomepage || navLinks !== undefined;'
    );
    expect(headerSource).toContain('minimalAuth={isMinimal}');
    expect(headerSource).toContain("minimalAuthLabel='Sign in'");
    expect(headerSource).toContain('showContactLink={false}');
    expect(headerSource).toContain('marketing-header-growth-space');
    expect(headerSource).not.toContain('MARKETING_GLASS_FLYOUTS');
    expect(headerSource).not.toContain('HOMEPAGE_LAUNCH_COPY.hero.primaryCta');
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
