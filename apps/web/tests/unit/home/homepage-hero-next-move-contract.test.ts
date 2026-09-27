import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';

const webRoot = path.resolve(__dirname, '../../..');

function readHeroCss(): string {
  return readFileSync(
    path.join(webRoot, 'components/homepage/HomepageIdentity.css'),
    'utf8'
  );
}

function readNameSearchCss(): string {
  const css = readFileSync(path.join(webRoot, 'app/(home)/home.css'), 'utf8');
  const start = css.indexOf('HOMEPAGE NAME SEARCH START');
  const end = css.indexOf('HOMEPAGE NAME SEARCH END', start);
  return css.slice(start, end);
}

describe('homepage hero contract (JOV-5864)', () => {
  it('mounts only the approved hero rasters, never CSS background images', () => {
    const pageSource = readFileSync(
      path.join(webRoot, 'app/(home)/page.tsx'),
      'utf8'
    );
    const componentSource = [
      'components/homepage/HomepageEditorialHero.tsx',
      'components/homepage/HomepageProfileSpecimen.tsx',
    ]
      .map(file => readFileSync(path.join(webRoot, file), 'utf8'))
      .join('\n');
    const heroSource = pageSource.slice(
      pageSource.indexOf('function HomepageHero()'),
      pageSource.indexOf('function HomepageUnlockedSections()')
    );
    const heroCss = readHeroCss();
    const rejectedPhotoFixture = `
      <picture><img src='/stock-nightlife.webp' /></picture>
      .homepage-identity-hero { background: image-set(url('/stock.jpg') 1x); }
    `;
    const rasterSourcePattern =
      /<(?:picture|img|video|canvas)\b|\.(?:avif|gif|jpe?g|png|webp)\b/i;
    const cssImagePattern = /\b(?:url|image-set)\s*\(/i;

    expect(rejectedPhotoFixture).toMatch(rasterSourcePattern);
    expect(rejectedPhotoFixture).toMatch(cssImagePattern);
    // The page itself mounts no media; the hero owns exactly two rasters.
    expect(heroSource).not.toMatch(rasterSourcePattern);
    expect(heroCss).not.toMatch(cssImagePattern);
    expect(componentSource).not.toMatch(/<(?:picture|img|video|canvas)\b/);
    expect(
      [...componentSource.matchAll(/'\/assets\/generated\/[^']+'/g)].map(
        match => match[0]
      )
    ).toEqual([
      "'/assets/generated/homepage-hero-technical-texture-v1.webp'",
      "'/assets/generated/homepage-avery-chen-portrait-v1.webp'",
    ]);
    // The hero texture is the LCP layer: priority, full-bleed, sized by fill.
    expect(componentSource).toMatch(
      /<Image\s+alt=''\s+className='homepage-identity-hero__texture-image'\s+fill\s+priority\s+sizes='100vw'/
    );
  });

  it('uses the exact canonical headline and one support line', () => {
    expect(HOMEPAGE_LAUNCH_COPY.hero.eyebrow).toBe(
      'Jovie / Identity, connected'
    );
    expect(HOMEPAGE_LAUNCH_COPY.hero.headline).toBe(
      'A living identity for the internet.'
    );
    expect(HOMEPAGE_LAUNCH_COPY.hero.subhead).toBe(
      'Your work, your links, your next chapter. Together in your Jovie profile.'
    );
  });

  it('keeps one primary action with the name search as the waitlist-off fallback', () => {
    expect(HOMEPAGE_LAUNCH_COPY.hero.search).toEqual({
      placeholder: 'Search your name',
      action: 'Find me',
    });

    const pageSource = readFileSync(
      path.join(webRoot, 'app/(home)/page.tsx'),
      'utf8'
    );
    const heroSource = pageSource.slice(
      pageSource.indexOf('function HomepageHero()'),
      pageSource.indexOf('function HomepageUnlockedSections()')
    );

    expect(heroSource).toContain(
      "<HomepageEditorialHero headingId='home-hero-heading' />"
    );
    expect(heroSource).not.toContain('primaryCta');
    expect(heroSource).not.toContain('secondaryCta');
    expect(heroSource).not.toMatch(/Get started|Drop more music|waitlist/i);
    expect(pageSource).not.toContain('/images/hero/');
  });

  it('keeps the two-line H1 measure balanced at every width', () => {
    const css = readHeroCss();

    expect(css).toMatch(
      /\.homepage-identity-hero__headline\s*\{[\s\S]*?max-width: 11ch;[\s\S]*?text-wrap: balance;[\s\S]*?\}/
    );
    expect(css).toMatch(
      /\.homepage-identity-hero__support\s*\{[\s\S]*?text-wrap: balance;[\s\S]*?\}/
    );
    expect(css).not.toMatch(/white-space: nowrap/);
  });

  it('clips the name-search aura to the pill', () => {
    const css = readNameSearchCss();

    expect(css).not.toMatch(/\.group\\\//);
    const auraCss = readFileSync(
      path.join(webRoot, 'components/features/home/InputAuraFrame.css'),
      'utf8'
    );
    expect(auraCss).toContain('input-aura-frame--editorial');
    expect(auraCss).toContain('mask-composite: exclude');
  });

  it('keeps the Find me pill on the 32/510 marketing button contract', () => {
    const css = readNameSearchCss();

    expect(css).toMatch(
      /\.homepage-name-search__submit\s*\{[\s\S]*?var\(--font-satoshi\)[\s\S]*?font-size: 14px;[\s\S]*?font-weight: 510;[\s\S]*?\}/
    );
  });

  it('drifts only the texture for 20s with reduced-motion parity', () => {
    const css = readHeroCss();

    expect(css).toContain(
      'animation: homepage-identity-texture-drift 20s ease-in-out infinite'
    );
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('animation: none;');
    expect(css).not.toContain('homepage-hero-content-reveal');
  });

  it('mounts registry Artist Profile previews directly in phone frames', () => {
    const profilesSource = readFileSync(
      path.join(webRoot, 'components/homepage/MeetJovieCarousel.tsx'),
      'utf8'
    );

    expect(profilesSource).toContain('ArtistProfilePhoneFrame');
    expect(profilesSource).toContain('homepage-artist-profile-preview__device');
    expect(profilesSource).not.toContain('homepage-artist-outcome__copy');
  });

  it('uses the one canonical docked marketing header and the full footer', () => {
    const headerSource = readFileSync(
      path.join(webRoot, 'components/site/MarketingHeader.tsx'),
      'utf8'
    );
    const layoutSource = readFileSync(
      path.join(webRoot, 'app/(home)/layout.tsx'),
      'utf8'
    );

    expect(headerSource).toContain('MARKETING_GLASS_DESKTOP_LINKS');
    expect(headerSource).toContain('MARKETING_CUSTOMERS_FLYOUT');
    expect(headerSource).toContain("presentation === 'marketing-glass'");
    // Default landing header (marketing glass), docked over the hero.
    expect(layoutSource).not.toContain('headerVariant=');
    expect(layoutSource).not.toContain('mainOffset={false}');
    expect(layoutSource).toContain("footerVariant='expanded'");
    expect(layoutSource).toContain("logoSize='sm'");
    expect(layoutSource).not.toContain("logoVariant='word'");
    expect(layoutSource).not.toContain('showHomepageCenterNav={false}');
    expect(layoutSource).not.toContain('HomeScrollWatcher');

    const css = readFileSync(path.join(webRoot, 'app/(home)/home.css'), 'utf8');
    expect(css).not.toMatch(
      /\.homepage-header-auth a:last-child\s*\{[\s\S]*?background:/
    );
  });

  it('uses the production release URL in the captured product surface', () => {
    const smartLinkSource = readFileSync(
      path.join(
        webRoot,
        'components/organisms/release-sidebar/ReleaseSmartLinkAnalytics.tsx'
      ),
      'utf8'
    );
    const demoDataSource = readFileSync(
      path.join(webRoot, 'components/features/demo/mock-release-data.ts'),
      'utf8'
    );

    expect(smartLinkSource).toContain(
      '`${PROFILE_URL}${release.smartLinkPath}`'
    );
    expect(demoDataSource).toContain("? 'calvinharris'");
    expect(demoDataSource).toContain(
      'smartLinkPath: `/${publicHandle}/${release.slug}`'
    );
  });
});
