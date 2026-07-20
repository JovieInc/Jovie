import type { ArtistProfileSectionFlags } from '@/lib/featureFlags';

export type ArtistProfileSectionId =
  | 'hero'
  | 'adaptive'
  | 'outcomes'
  | 'capture'
  | 'opinionated'
  | 'specWall'
  | 'howItWorks'
  | 'socialProof'
  | 'faq'
  | 'finalCta';

export interface ArtistProfileSectionOrderEntry {
  readonly id: ArtistProfileSectionId;
  readonly label: string;
  readonly testId: string;
  readonly screenshotScenarioId?: string;
  readonly enabledByFlag?: keyof Pick<
    ArtistProfileSectionFlags,
    'SOCIAL_PROOF' | 'FAQ'
  >;
}

export type ArtistProfileScreenshotSectionOrderEntry =
  ArtistProfileSectionOrderEntry & {
    readonly screenshotScenarioId: string;
  };

export const ARTIST_PROFILE_SECTION_ORDER: readonly ArtistProfileSectionOrderEntry[] =
  [
    {
      id: 'hero',
      label: 'Hero',
      testId: 'artist-profile-section-hero',
      screenshotScenarioId: 'artist-profile-hero-section-desktop',
    },
    {
      id: 'adaptive',
      label: 'Adaptive Profile',
      testId: 'artist-profile-section-adaptive',
      screenshotScenarioId: 'artist-profile-adaptive-section-desktop',
    },
    {
      id: 'outcomes',
      label: 'Fan Outcomes',
      testId: 'artist-profile-section-outcomes',
      screenshotScenarioId: 'artist-profile-outcomes-section-desktop',
    },
    {
      id: 'capture',
      label: 'Capture Every Fan',
      testId: 'artist-profile-section-capture',
      screenshotScenarioId: 'artist-profile-capture-section-desktop',
    },
    {
      id: 'opinionated',
      label: 'Opinionated by Design',
      testId: 'artist-profile-section-opinionated',
      screenshotScenarioId: 'artist-profile-opinionated-section-desktop',
    },
    {
      id: 'specWall',
      label: 'Product Truth',
      testId: 'artist-profile-section-spec-wall',
      screenshotScenarioId: 'artist-profile-spec-wall-section-desktop',
    },
    {
      id: 'howItWorks',
      label: 'How It Works',
      testId: 'artist-profile-section-how-it-works',
      screenshotScenarioId: 'artist-profile-how-it-works-section-desktop',
    },
    {
      id: 'socialProof',
      label: 'Social Proof',
      testId: 'artist-profile-section-social-proof',
      enabledByFlag: 'SOCIAL_PROOF',
    },
    {
      id: 'faq',
      label: 'FAQ',
      testId: 'artist-profile-section-faq',
      screenshotScenarioId: 'artist-profile-faq-section-desktop',
      enabledByFlag: 'FAQ',
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

export const ARTIST_PROFILE_SECTION_TEST_IDS = Object.fromEntries(
  ARTIST_PROFILE_SECTION_ORDER.map(section => [section.id, section.testId])
) as Readonly<Record<ArtistProfileSectionId, string>>;
