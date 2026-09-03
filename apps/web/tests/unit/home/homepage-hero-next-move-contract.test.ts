import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';

const webRoot = path.resolve(__dirname, '../../..');

function readHeroCss(): string {
  const css = readFileSync(path.join(webRoot, 'app/(home)/home.css'), 'utf8');
  const start = css.indexOf('HOMEPAGE EDITORIAL HERO START');
  const end = css.indexOf('HOMEPAGE EDITORIAL HERO END', start);
  return css.slice(start, end);
}

describe('homepage hero contract (JOV-5864)', () => {
  it('uses the exact locked headline and one-line support', () => {
    expect(HOMEPAGE_LAUNCH_COPY.hero.headline).toBe(
      'Control how the world sees you.'
    );
    expect(HOMEPAGE_LAUNCH_COPY.hero.subhead).toBe(
      'Find what the internet knows about you, bring it together, and turn attention into lasting relationships.'
    );
  });

  it('keeps the existing name search as the sole primary conversion', () => {
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
      pageSource.indexOf('function HomepageFaq()')
    );

    expect(heroSource).toContain('search={HERO_COPY.search}');
    expect(heroSource).not.toContain('primaryCta');
    expect(heroSource).not.toContain('secondaryCta');
    expect(heroSource).not.toMatch(/Get started|Drop more music|waitlist/i);
  });

  it('keeps the Quiet H1 ramp and balanced support copy', () => {
    const css = readHeroCss();

    expect(css).toContain('font-size: 38px;');
    expect(css).toContain('font-size: 56px;');
    expect(css).toContain('font-size: 64px;');
    expect(css).toContain('font-weight: 510;');
    expect(css).toContain('letter-spacing: -0.022em;');
    expect(css).toContain('text-wrap: balance;');
    expect(css).toContain('text-wrap: pretty;');
  });

  it('keeps the Find me pill on the 32/510 marketing button contract', () => {
    const css = readHeroCss();

    expect(css).toMatch(
      /\.homepage-name-search__submit\s*\{[\s\S]*?var\(--font-satoshi\)[\s\S]*?font-size: 14px;[\s\S]*?font-weight: 510;[\s\S]*?\}/
    );
  });

  it('uses a 100ms opacity-only ready reveal with reduced-motion parity', () => {
    const css = readHeroCss();

    expect(css).toContain('--homepage-hero-reveal-delay: 100ms;');
    expect(css).toContain('animation: homepage-hero-content-reveal');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('animation: none;');
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

  it('keeps homepage nav as icon, canonical links, and Log in only', () => {
    const headerSource = readFileSync(
      path.join(webRoot, 'components/site/MarketingHeader.tsx'),
      'utf8'
    );
    const layoutSource = readFileSync(
      path.join(webRoot, 'app/(home)/layout.tsx'),
      'utf8'
    );

    expect(headerSource).toContain('minimalAuth={isMinimal || isHomepage}');
    expect(headerSource).toContain("isHomepage ? 'Log in' : 'Sign in'");
    expect(layoutSource).toContain("logoSize='lg'");
    expect(layoutSource).toContain("logoVariant='icon'");
    expect(layoutSource).toContain('navLinks={MARKETING_NAV_LINKS}');
    expect(layoutSource).toContain('showHomepageCenterNav');

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
