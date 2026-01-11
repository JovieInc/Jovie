import type { IngestPlatform, PlatformOption } from './types';

export const PLATFORM_OPTIONS: PlatformOption[] = [
  {
    id: 'linktree',
    label: 'Linktree',
    placeholder: 'https://linktr.ee/username',
    enabled: true,
  },
  {
    id: 'thematic_artist',
    label: 'Thematic Artist',
    placeholder: 'https://app.hellothematic.com/artist/profile/123456',
    enabled: true,
  },
  {
    id: 'thematic_creator',
    label: 'Thematic Creator',
    placeholder: 'https://app.hellothematic.com/creator/profile/123456',
    enabled: true,
  },
  {
    id: 'beacons',
    label: 'Beacons',
    placeholder: 'https://beacons.ai/username',
    enabled: false,
  },
  {
    id: 'instagram',
    label: 'Instagram',
    placeholder: 'https://instagram.com/username',
    enabled: false,
  },
];

export const PLATFORM_PREFIX: Record<IngestPlatform, string> = {
  linktree: 'https://linktr.ee/',
  thematic_artist: 'https://app.hellothematic.com/artist/profile/',
  thematic_creator: 'https://app.hellothematic.com/creator/profile/',
  beacons: 'https://beacons.ai/',
  instagram: 'https://instagram.com/',
};
