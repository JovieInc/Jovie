import type { PlatformInfo } from '@/lib/utils/platform-detection/types';

export const INGEST_NETWORKS = [
  {
    id: 'instagram',
    label: 'Instagram',
    placeholder: 'instagram.com/username',
    preset: 'instagram.com/',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    placeholder: 'tiktok.com/@username',
    preset: 'tiktok.com/@',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    placeholder: 'youtube.com/@channel',
    preset: 'youtube.com/@',
  },
  {
    id: 'spotify',
    label: 'Spotify',
    placeholder: 'Search Spotify artists',
    preset: '',
  },
  {
    id: 'x',
    label: 'X',
    placeholder: 'x.com/username',
    preset: 'x.com/',
  },
  {
    id: 'linktree',
    label: 'Linktree',
    placeholder: 'linktr.ee/username',
    preset: 'linktr.ee/',
  },
] as const;

export type IngestNetworkId = (typeof INGEST_NETWORKS)[number]['id'];

const NETWORK_SET = new Set<IngestNetworkId>(INGEST_NETWORKS.map(n => n.id));

export function getNetworkFromPlatform(
  platform: PlatformInfo | null
): IngestNetworkId | null {
  if (!platform) return null;
  if (platform.id === 'twitter') return 'x';
  return NETWORK_SET.has(platform.id as IngestNetworkId)
    ? (platform.id as IngestNetworkId)
    : null;
}
