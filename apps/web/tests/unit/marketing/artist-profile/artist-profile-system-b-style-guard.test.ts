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
  /#[0-9a-fA-F]{3,8}/,
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
  'ArtistProfileSpecWall',
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
    expect(route).toContain('<MarketingPageShell>');

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
    expect(sectionHeader).toContain('text-secondary-token');
  });
});
