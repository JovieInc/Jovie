import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';

export interface ProviderOverride {
  key: ProviderKey;
  url: string;
  source?: 'ingested' | 'manual';
  updatedAt?: string;
}

export interface MockReleaseOptions {
  id?: string;
  title?: string;
  providers?: ProviderOverride[];
  hasVideoLinks?: boolean;
}

export function createMockRelease(
  options: MockReleaseOptions = {}
): ReleaseViewModel {
  const id = options.id ?? 'release_1';
  const title = options.title ?? 'Test Release';
  const slug = title.toLowerCase().replace(/\s+/g, '-');
  const smartLinkPath = `/r/${slug}--${id}`;
  const providers = (options.providers ?? []).map(provider => ({
    key: provider.key,
    url: provider.url,
    source: provider.source ?? 'manual',
    updatedAt: provider.updatedAt ?? '2025-06-01T00:00:00.000Z',
    label: provider.key,
    path: `/${provider.key}`,
    isPrimary: false,
  }));

  return {
    id,
    profileId: 'profile_1',
    title,
    releaseDate: '2025-06-01T00:00:00.000Z',
    artworkUrl: 'https://cdn.jovie.test/releases/artwork.jpg',
    slug,
    smartLinkPath,
    spotifyPopularity: 72,
    providers,
    releaseType: 'single',
    upc: '123456789012',
    label: 'Jovie Records',
    totalTracks: 1,
    totalDurationMs: 185000,
    primaryIsrc: 'USRC17607839',
    genres: ['Indie Pop'],
    canvasStatus: 'not_set',
    hasVideoLinks: options.hasVideoLinks ?? false,
    lyrics: 'Sample lyrics',
  };
}
