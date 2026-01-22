import {
  ActionDrivenProfileSectionClient,
  type ActionDrivenProfileSectionClientProps,
} from '@/components/home/action-driven-profile-section';

const PROFILE_ARTIST = {
  name: 'Mara Vale',
  handle: '@maravale',
  tagline: 'New single out now. Tour announced.',
} as const;

const SHARED_PILLAR = {
  eyebrow: 'Adaptive fan routing',
  title: 'One profile. Optimized for every fan.',
  description: 'Same artist profile. Ordered automatically per fan.',
} as const;

const PILLARS = [
  {
    ...SHARED_PILLAR,
    id: 'streams',
    tabLabel: 'Drive streams',
    fanChip: 'Fan: Spotify-heavy',
    metricChip: 'More stream clicks',
    actions: [
      'Pinned the best-performing streaming link for this fan',
      'Testing listen CTA copy (A/B)',
      'Moved video below listen for higher conversion',
    ],
    promotedModuleId: 'listen',
    accentClassName:
      'bg-[radial-gradient(circle_at_20%_20%,rgba(120,119,198,0.18),transparent_55%)] dark:bg-[radial-gradient(circle_at_20%_20%,rgba(120,119,198,0.24),transparent_55%)]',
  },
  {
    ...SHARED_PILLAR,
    id: 'merch',
    tabLabel: 'Sell merch',
    fanChip: 'Fan: High merch intent',
    metricChip: 'More merch clicks',
    actions: [
      'Featured your highest-converting item for this fan',
      'Pinned merch during peak buying sessions',
      'Testing product image variants (A/B)',
    ],
    promotedModuleId: 'merch',
    accentClassName:
      'bg-[radial-gradient(circle_at_70%_25%,rgba(245,158,11,0.12),transparent_60%)] dark:bg-[radial-gradient(circle_at_70%_25%,rgba(245,158,11,0.18),transparent_60%)]',
  },
  {
    ...SHARED_PILLAR,
    id: 'tickets',
    tabLabel: 'Sell tickets',
    fanChip: 'Fan: Nearby (Austin)',
    metricChip: 'More ticket clicks',
    actions: [
      'Prioritized the closest upcoming show',
      'Pinned tickets when the fan is near a tour city',
      'Shortened CTA on mobile to reduce drop-off',
    ],
    promotedModuleId: 'tickets',
    accentClassName:
      'bg-[radial-gradient(circle_at_50%_20%,rgba(34,197,94,0.12),transparent_60%)] dark:bg-[radial-gradient(circle_at_50%_20%,rgba(34,197,94,0.18),transparent_60%)]',
  },
] as const satisfies ActionDrivenProfileSectionClientProps['pillars'];

export function ActionDrivenProfileSection() {
  return (
    <ActionDrivenProfileSectionClient
      pillars={PILLARS}
      profileArtist={PROFILE_ARTIST}
    />
  );
}
