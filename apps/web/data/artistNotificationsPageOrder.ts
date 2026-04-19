export type ArtistNotificationsSectionId =
  | 'hero'
  | 'trust'
  | 'capture'
  | 'reactivation'
  | 'benefits'
  | 'specWall'
  | 'faq'
  | 'finalCta';

export interface ArtistNotificationsSectionOrderEntry {
  readonly id: ArtistNotificationsSectionId;
  readonly label: string;
  readonly testId: string;
}

export const ARTIST_NOTIFICATIONS_SECTION_ORDER: readonly ArtistNotificationsSectionOrderEntry[] =
  [
    {
      id: 'hero',
      label: 'Hero',
      testId: 'artist-notifications-section-hero',
    },
    {
      id: 'trust',
      label: 'Trust Strip',
      testId: 'artist-notifications-section-trust',
    },
    {
      id: 'capture',
      label: 'Capture Every Fan',
      testId: 'artist-notifications-section-capture',
    },
    {
      id: 'reactivation',
      label: 'Notify Them Automatically',
      testId: 'artist-notifications-section-reactivation',
    },
    {
      id: 'benefits',
      label: 'Why It Pays',
      testId: 'artist-notifications-section-benefits',
    },
    {
      id: 'specWall',
      label: 'Power Features',
      testId: 'artist-notifications-section-spec-wall',
    },
    {
      id: 'faq',
      label: 'FAQ',
      testId: 'artist-notifications-section-faq',
    },
    {
      id: 'finalCta',
      label: 'Final CTA',
      testId: 'artist-notifications-section-final-cta',
    },
  ];

export const ARTIST_NOTIFICATIONS_SECTION_TEST_IDS = Object.fromEntries(
  ARTIST_NOTIFICATIONS_SECTION_ORDER.map(section => [
    section.id,
    section.testId,
  ])
) as Readonly<Record<ArtistNotificationsSectionId, string>>;
