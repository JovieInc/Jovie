import type { ArtistProfileSectionFlags } from '@/lib/featureFlags';

export type ArtistProfileSectionId =
  | 'hero'
  | 'trust'
  | 'adaptive'
  | 'outcomes'
  | 'monetization'
  | 'capture'
  | 'reactivation'
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
    },
    {
      id: 'adaptive',
      label: 'One Profile',
      testId: 'artist-profile-section-adaptive',
      screenshotScenarioId: 'artist-profile-adaptive-section-desktop',
    },
    {
      id: 'trust',
      label: 'Trust Logo Bar',
      testId: 'artist-profile-section-trust',
    },
    {
      id: 'capture',
      label: 'Capture Every Fan',
      testId: 'artist-profile-section-capture',
      screenshotScenarioId: 'artist-profile-capture-section-desktop',
    },
    {
      id: 'reactivation',
      label: 'Notify Them Automatically',
      testId: 'artist-profile-section-reactivation',
      screenshotScenarioId: 'artist-profile-reactivation-section-desktop',
    },
    {
      id: 'monetization',
      label: 'Monetization',
      testId: 'artist-profile-section-monetization',
      screenshotScenarioId: 'artist-profile-monetization-section-desktop',
    },
    {
      id: 'outcomes',
      label: 'Built for Artists',
      testId: 'artist-profile-section-outcomes',
      screenshotScenarioId: 'artist-profile-built-for-artists-section-desktop',
    },
    {
      id: 'specWall',
      label: 'Power Features',
      testId: 'artist-profile-section-spec-wall',
      screenshotScenarioId: 'artist-profile-power-features-section-desktop',
    },
    {
      id: 'howItWorks',
      label: 'Live In 60 Seconds',
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
      enabledByFlag: 'FAQ',
    },
    {
      id: 'finalCta',
      label: 'Final CTA',
      testId: 'artist-profile-section-final-cta',
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
