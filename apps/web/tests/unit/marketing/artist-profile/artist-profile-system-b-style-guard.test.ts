import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * /artist-profile + /artist-profiles System B source contract.
 *
 * Part of the founder-directed System A -> System B marketing migration
 * (DESIGN.md 2026-06-18). Full strict contract after the #14627 migration
 * across the entire artist-profile landing family.
 */

const familyDir = 'components/marketing/artist-profile' as const;

const routeSources = [
  'app/(marketing)/artist-profile/page.tsx',
  'app/(marketing)/artist-profiles/page.tsx',
] as const;

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
  /\bmarketing-(?:h[1-6]|kicker|lead|body)-?linear\b|\bmarketing-kicker\b/,
] as const;

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

function familySources(): string[] {
  return readdirSync(resolve(process.cwd(), familyDir))
    .filter(file => file.endsWith('.tsx'))
    .map(file => `${familyDir}/${file}`);
}

describe('artist profile landing family System B source contract', () => {
  it('keeps routes and the whole family on named System B primitives', () => {
    for (const sourcePath of [...routeSources, ...familySources()]) {
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
      resolve(
        process.cwd(),
        'components/marketing/artist-profile/ArtistProfileLandingPage.tsx'
      ),
      'utf8'
    );
    for (const component of sectionComponents) {
      expect(
        landing,
        `ArtistProfileLandingPage.tsx must compose ${component}`
      ).toContain(`<${component}`);
    }

    const sectionHeader = readFileSync(
      resolve(
        process.cwd(),
        'components/marketing/artist-profile/ArtistProfileSectionHeader.tsx'
      ),
      'utf8'
    );
    expect(sectionHeader).toContain('system-b-artist-profile-shell-h2');
    expect(sectionHeader).toContain('system-b-artist-profile-shell-lead');
  });
});
