import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';

const webRoot = path.resolve(__dirname, '../../..');

describe('homepage hero next-move contract (JOV-4475)', () => {
  it('uses the exact approved headline and supporting line', () => {
    expect(HOMEPAGE_LAUNCH_COPY.hero.headline).toBe(
      'Jovie helps you move your music forward.'
    );
    expect(HOMEPAGE_LAUNCH_COPY.hero.subhead).toBe(
      'It uses your catalog, audience, and artist presence to surface the one action most likely to pay off.'
    );
  });

  it('keeps Get started as the sole primary conversion path', () => {
    expect(HOMEPAGE_LAUNCH_COPY.hero.primaryCta.label).toBe('Get started');
    expect(HOMEPAGE_LAUNCH_COPY.hero.secondaryCta.label).toBe(
      'See a live profile'
    );
    expect(HOMEPAGE_LAUNCH_COPY.hero.secondaryCta.href).toBe(
      '/artist-profiles'
    );
  });

  it('demotes the live-profile path to a quiet ghost control in the poster hero', () => {
    const heroSource = readFileSync(
      path.join(webRoot, 'components/homepage/HomepagePosterHero.tsx'),
      'utf8'
    );

    expect(heroSource).toContain("data-testid='homepage-primary-cta'");
    expect(heroSource).toContain("data-testid='homepage-secondary-cta'");
    expect(heroSource).toContain("variant='primary'");
    expect(heroSource).toContain("variant='ghost'");
    expect(heroSource).not.toMatch(
      /secondaryCta[\s\S]*?variant=['"]tertiary['"]/
    );
    expect(heroSource).not.toContain('active:scale');
  });

  it('uses a 100ms opacity-only ready reveal with reduced-motion parity', () => {
    const css = readFileSync(path.join(webRoot, 'app/(home)/home.css'), 'utf8');
    const heroCssStart = css.indexOf('HOMEPAGE POSTER HERO SYSTEM B START');
    const heroCssEnd = css.indexOf(
      'HOMEPAGE POSTER HERO SYSTEM B END',
      heroCssStart
    );
    const heroCss = css.slice(heroCssStart, heroCssEnd);

    expect(heroCss).toContain('--homepage-hero-reveal-delay: 100ms;');
    expect(heroCss).toContain('@keyframes homepage-hero-content-reveal');
    expect(heroCss).toContain('opacity: 0;');
    expect(heroCss).toContain('opacity: 1;');
    expect(heroCss).not.toMatch(
      /@keyframes homepage-hero-content-reveal[\s\S]*?(?:transform|translate|scale|height|margin)/
    );
    expect(heroCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(heroCss).toContain('animation: none;');
  });

  it('keeps product proof on a truthful screenshot path, not Deep End mock copy', () => {
    const pageSource = readFileSync(
      path.join(webRoot, 'app/(home)/page.tsx'),
      'utf8'
    );
    const commandCenterSource = readFileSync(
      path.join(webRoot, 'components/homepage/HomepageHeroCommandCenter.tsx'),
      'utf8'
    );

    expect(pageSource).toContain(
      "getMarketingExportImage('dashboard-releases-desktop')"
    );
    expect(pageSource).toContain('<HomepageHeroCommandCenter');
    expect(commandCenterSource).toContain('homepage-product-pane__image');
    expect(commandCenterSource).not.toMatch(/The Deep End|Deep End/);
    expect(pageSource).not.toMatch(
      /function HomepageHero\(\)[\s\S]*?The Deep End/
    );
  });

  it('mounts Artist Profiles cards in iPhone device frames', () => {
    const profilesSource = readFileSync(
      path.join(webRoot, 'components/homepage/MeetJovieCarousel.tsx'),
      'utf8'
    );

    expect(profilesSource).toContain('ArtistProfilePhoneFrame');
    expect(profilesSource).toContain('homepage-artist-outcome__device');
  });
});
