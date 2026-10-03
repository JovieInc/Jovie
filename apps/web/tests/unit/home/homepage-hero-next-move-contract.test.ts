import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HOMEPAGE_IDENTITY_COPY } from '@/data/homepageIdentityCopy';

const webRoot = path.resolve(__dirname, '../../..');

function readHeroCss(): string {
  return readFileSync(
    path.join(webRoot, 'components/homepage/HomepageIdentity.css'),
    'utf8'
  );
}

function readNameSearchCss(): string {
  const css = readFileSync(path.join(webRoot, 'app/(home)/home.css'), 'utf8');
  const start = css.indexOf('HOMEPAGE EDITORIAL HERO START');
  const end = css.indexOf('HOMEPAGE EDITORIAL HERO END', start);
  return css.slice(start, end);
}

describe('homepage hero contract (JOV-5864)', () => {
  it('mounts only the approved hero rasters, never CSS background images', () => {
    const pageSource = readFileSync(
      path.join(webRoot, 'app/(home)/page.tsx'),
      'utf8'
    );
    const componentSource = readFileSync(
      path.join(webRoot, 'components/homepage/HomepageIdentityHero.tsx'),
      'utf8'
    );
    const heroSource = pageSource.slice(
      pageSource.indexOf('function HomepageHero()'),
      pageSource.indexOf('function HomepageUnlockedSections()')
    );
    // The page mounts no media; the hero owns exactly the Pen texture photo
    // plus Tim White's real avatar as proof (JOV-6946).
    expect(heroSource).not.toMatch(/<(?:picture|img|video|canvas)\b/i);
    expect(readHeroCss()).not.toMatch(/\b(?:url|image-set)\s*\(/i);
    expect(componentSource).not.toMatch(/<(?:picture|img|video|canvas)\b/);
    expect(
      [...componentSource.matchAll(/'\/assets\/generated\/[^']+'/g)].map(
        match => match[0]
      )
    ).toEqual(["'/assets/generated/homepage-hero-technical-texture-v1.webp'"]);
    expect(componentSource).not.toContain('HOMEPAGE_MEDIA_MAP');
  });

  it('uses the exact identity headline and one support line (Tim 2026-09-28)', () => {
    expect(HOMEPAGE_IDENTITY_COPY.hero.headline).toBe(
      'Be found. Be understood.'
    );
    expect(HOMEPAGE_IDENTITY_COPY.hero.subhead).toBe(
      'Claim your name. Jovie makes you easy to reach, for people and for agents.'
    );
  });

  it('keeps one primary action: the jov.ie/you claim', () => {
    expect(HOMEPAGE_IDENTITY_COPY.hero.claim).toEqual({
      domain: 'jov.ie/',
      placeholder: 'you',
      action: 'Claim',
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
      "<HomepageIdentityHero headingId='home-hero-heading' />"
    );
    expect(heroSource).not.toContain('primaryCta');
    expect(heroSource).not.toContain('secondaryCta');
    expect(heroSource).not.toMatch(/Get started|Drop more music|waitlist/i);
    expect(pageSource).not.toContain('/images/hero/');
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

  it('keeps the hero still: a static CSS light, no drift or reveal', () => {
    const css = readHeroCss();

    expect(css).not.toContain('homepage-identity-texture-drift');
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
