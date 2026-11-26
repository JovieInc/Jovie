import type { ArtistProfileSectionFlags } from '@/lib/featureFlags';

export type ArtistProfileSectionId =
  | 'hero'
  | 'adaptive'
  | 'outcomes'
  | 'capture'
  | 'howItWorks'
  | 'showcase'
  | 'finalCta'
  // Retained for Storybook / certificate fixtures that still mount cut sections.
  | 'opinionated'
  | 'specWall'
  | 'specBento'
  | 'releaseCycle'
  | 'faq';

export interface ArtistProfileSectionOrderEntry {
  readonly id: ArtistProfileSectionId;
  readonly label: string;
  readonly testId: string;
  readonly screenshotScenarioId?: string;
  readonly enabledByFlag?: keyof Pick<ArtistProfileSectionFlags, 'FAQ'>;
}

export type ArtistProfileScreenshotSectionOrderEntry =
  ArtistProfileSectionOrderEntry & {
    readonly screenshotScenarioId: string;
  };

/**
 * Six-section homepage-system order for /solutions/artists (JOV-14242).
 * The mode switcher lives inside the hero (`adaptive` test id) and is not a
 * separate ordered sibling.
 */
export const ARTIST_PROFILE_SECTION_ORDER: readonly ArtistProfileSectionOrderEntry[] =
  [
    {
      id: 'hero',
      label: 'Hero',
      testId: 'artist-profile-section-hero',
      screenshotScenarioId: 'artist-profile-hero-section-desktop',
    },
    {
      id: 'outcomes',
      label: 'Audience outcomes',
      testId: 'artist-profile-section-outcomes',
      screenshotScenarioId: 'artist-profile-outcomes-section-desktop',
    },
    {
      id: 'capture',
      label: 'Capture every listener',
      testId: 'artist-profile-section-capture',
      screenshotScenarioId: 'artist-profile-capture-section-desktop',
    },
    {
      id: 'howItWorks',
      label: 'How It Works',
      testId: 'artist-profile-section-how-it-works',
      screenshotScenarioId: 'artist-profile-how-it-works-section-desktop',
    },
    {
      id: 'showcase',
      label: 'Live Artist Sites',
      testId: 'artist-profile-section-showcase',
    },
    {
      id: 'finalCta',
      label: 'Final CTA',
      testId: 'artist-profile-section-final-cta',
      screenshotScenarioId: 'artist-profile-final-cta-section-desktop',
    },
  ];

function hasScreenshotScenario(
  section: ArtistProfileSectionOrderEntry
): section is ArtistProfileScreenshotSectionOrderEntry {
  return section.screenshotScenarioId !== undefined;
}

export const ARTIST_PROFILE_SECTION_SCREENSHOT_ORDER =
  ARTIST_PROFILE_SECTION_ORDER.filter(hasScreenshotScenario);

export const ARTIST_PROFILE_SECTION_TEST_IDS: Readonly<
  Record<ArtistProfileSectionId, string>
> = {
  hero: 'artist-profile-section-hero',
  adaptive: 'artist-profile-section-adaptive',
  outcomes: 'artist-profile-section-outcomes',
  capture: 'artist-profile-section-capture',
  howItWorks: 'artist-profile-section-how-it-works',
  showcase: 'artist-profile-section-showcase',
  finalCta: 'artist-profile-section-final-cta',
  opinionated: 'artist-profile-section-opinionated',
  specWall: 'artist-profile-section-spec-wall',
  specBento: 'artist-profile-section-spec-bento',
  releaseCycle: 'artist-profile-section-release-cycle',
  faq: 'artist-profile-section-faq',
};
