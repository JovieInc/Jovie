import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * /artist-profile + /artist-profiles System B source contract.
 *
 * Part of the founder-directed System A -> System B marketing migration
 * (DESIGN.md 2026-06-18). Mirrors the shipped about/support/download guards.
 *
 * Both route files and the entire artist-profile component family carry the
 * full strict contract: no hex/rgba/gradient colors, no raw color scales, no
 * literal white/black utilities, no arbitrary values, no inline styles, no
 * named shadow scales, and no System A editorial type classes
 * (marketing-*-linear / marketing-kicker). Composition effects that the token
 * utilities cannot express live in colocated CSS files next to each
 * component.
 */

const routeSources = [
  'app/(marketing)/artist-profile/page.tsx',
  'app/(marketing)/artist-profiles/page.tsx',
] as const;

const familyDir = 'components/marketing/artist-profile' as const;

const forbiddenVisualPatterns = [
  /style=\{/,
  /#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient/,
  /--linear-/,
  /\b(?:bg|border|text|ring|shadow|decoration)-\[/,
  /\b(?:rounded|text|h|w|max-w|min-h|tracking|leading|px|py|pt|pb|z)-\[/,
  /\b(?:emerald|fuchsia|amber|sky|indigo|orange|rose|cyan|violet|red|blue|green|purple|pink|yellow|teal|lime|slate|gray|zinc|neutral|stone|black|white)-(?:[0-9]|\[|\/)/,
  /\b(?:bg|border|text|ring|shadow|decoration|from|via|to)-(?:white|black)(?:\/|\b)/,
  /\bshadow-(?:sm|md|lg|xl|2xl|inner)\b/,
  // System A editorial type classes — retired on this surface.
  /\bmarketing-(?:h[1-6]|kicker|lead|body)-?linear\b|\bmarketing-kicker\b/,
] as const;

const landingPageSource =
  'components/marketing/artist-profile/ArtistProfileLandingPage.tsx' as const;

const sectionComponents = [
  'ArtistProfileHeroAdaptiveIntro',
  'ArtistProfileOutcomesCarousel',
  'ArtistProfileCaptureSection',
  'ArtistProfileOpinionatedSection',
  'ArtistProfileAnnotatedTruth',
  'ArtistProfileHowItWorks',
  'ArtistProfileSocialProof',
  'ArtistProfileFaq',
  'ArtistProfileFinalCta',
] as const;

describe('artist profile landing family System B source contract', () => {
  it('keeps the routes and the whole family on named System B primitives', () => {
    const familySources = readdirSync(resolve(process.cwd(), familyDir))
      .filter(file => file.endsWith('.tsx'))
      .map(file => `${familyDir}/${file}`);

    for (const sourcePath of [...routeSources, ...familySources]) {
      const source = readFileSync(resolve(process.cwd(), sourcePath), 'utf8');
      for (const pattern of forbiddenVisualPatterns) {
        expect(source, `${sourcePath} matched ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('keeps the System B shell and section composition anchors in place', () => {
    const route = readFileSync(
      resolve(
        process.cwd(),
        'components/marketing/artist-profile/ArtistProfileLandingRoute.tsx'
      ),
      'utf8'
    );
    expect(route).toContain(
      "<MarketingPageShell className='artist-profiles-home-system'>"
    );

    const landing = readFileSync(
      resolve(process.cwd(), landingPageSource),
      'utf8'
    );
    for (const component of sectionComponents) {
      expect(
        landing,
        `${landingPageSource} must compose ${component}`
      ).toContain(`<${component}`);
    }

    const sectionHeader = readFileSync(
      resolve(
        process.cwd(),
        'components/marketing/artist-profile/ArtistProfileSectionHeader.tsx'
      ),
      'utf8'
    );
    expect(sectionHeader).toContain('text-primary-token');

    const sectionShell = readFileSync(
      resolve(
        process.cwd(),
        'components/marketing/artist-profile/ArtistProfileSectionShell.tsx'
      ),
      'utf8'
    );
    expect(sectionShell).toContain("'ap-section-container !px-0'");
    expect(sectionShell).toContain('ap-section-shell frame-section');

    const outcomes = readFileSync(
      resolve(
        process.cwd(),
        'components/marketing/artist-profile/ArtistProfileOutcomesCarousel.tsx'
      ),
      'utf8'
    );
    expect(outcomes).toContain("aria-label='Fan Outcomes'");
    expect(outcomes).not.toContain('MarketingSnapRail');
    expect(outcomes).not.toContain('scrollByDirection');

    const opinionated = readFileSync(
      resolve(
        process.cwd(),
        'components/marketing/artist-profile/ArtistProfileOpinionatedSection.tsx'
      ),
      'utf8'
    );
    expect(opinionated).toContain(
      "ariaLabel='Static Menu And Adaptive Profile Comparison'"
    );
    expect(opinionated).toContain('showMobileControls');
    expect(opinionated).toContain(
      "instructions='Use the previous and next buttons, or swipe, to compare both approaches.'"
    );

    const hero = readFileSync(
      resolve(
        process.cwd(),
        'components/marketing/artist-profile/ArtistProfileHero.tsx'
      ),
      'utf8'
    );
    expect(hero).toContain('HomepagePosterHero');
    expect(hero).toContain(
      "getMarketingExportImage('tim-white-profile-live-mobile')"
    );
    expect(hero).toContain("href: '#adaptive'");
    expect(hero).not.toContain('showSupport');
    expect(hero).not.toContain('hero.eyebrow');

    const intro = readFileSync(
      resolve(
        process.cwd(),
        'components/marketing/artist-profile/ArtistProfileHeroAdaptiveIntro.tsx'
      ),
      'utf8'
    );
    expect(intro).toContain('HomeTrustSection');
    expect(intro).toContain("presentation='inline-strip'");

    const capture = readFileSync(
      resolve(
        process.cwd(),
        'components/marketing/artist-profile/ArtistProfileCaptureSection.tsx'
      ),
      'utf8'
    );
    expect(capture).toContain('<MarketingSurfaceCard');
    expect(capture).toContain("variant='product-callout'");
    expect(capture).toContain("glowTone='teal'");
    expect(capture).toContain('<ArtistProfileCaptureVisual');
    expect(capture).not.toContain('ArtistProfilePhoneFrame');

    const captureShared = readFileSync(
      resolve(
        process.cwd(),
        'components/marketing/artist-profile/captureShared.tsx'
      ),
      'utf8'
    );
    expect(captureShared).toContain('data-phase={phase}');

    const captureVisual = readFileSync(
      resolve(
        process.cwd(),
        'components/marketing/MarketingStoryPrimitives.tsx'
      ),
      'utf8'
    );
    expect(captureVisual).not.toContain('loopTimer');

    const surfaceCard = readFileSync(
      resolve(process.cwd(), 'components/marketing/MarketingSurfaceCard.tsx'),
      'utf8'
    );
    expect(surfaceCard).toContain("| 'product-callout';");
    expect(surfaceCard).toContain('data-marketing-product-callout');

    const howItWorks = readFileSync(
      resolve(
        process.cwd(),
        'components/marketing/artist-profile/ArtistProfileHowItWorks.tsx'
      ),
      'utf8'
    );
    expect(howItWorks).toContain("'artist-spec-sync-settings-desktop'");
    expect(howItWorks).toContain('<Image');

    const finalCta = readFileSync(
      resolve(
        process.cwd(),
        'components/marketing/artist-profile/ArtistProfileFinalCta.tsx'
      ),
      'utf8'
    );
    expect(finalCta).toContain('getClaimProfileIntent');
    expect(finalCta).toContain('HomepageV2FinalCta');
    expect(finalCta).not.toContain('APP_ROUTES.SIGNUP');

    const faq = readFileSync(
      resolve(
        process.cwd(),
        'components/marketing/artist-profile/ArtistProfileFaq.tsx'
      ),
      'utf8'
    );
    expect(faq).toContain('homepage-faq-section');
    expect(faq).toContain('homepage-story-heading');
    expect(sectionHeader).toContain('text-secondary-token');
  });
});
