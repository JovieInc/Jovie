import type { IngestPlatform, PlatformOption } from './types';

export const PLATFORM_OPTIONS: PlatformOption[] = [
  {
    id: 'linktree',
    label: 'Linktree',
    placeholder: 'https://linktr.ee/username',
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
  beacons: 'https://beacons.ai/',
  instagram: 'https://instagram.com/',
};
