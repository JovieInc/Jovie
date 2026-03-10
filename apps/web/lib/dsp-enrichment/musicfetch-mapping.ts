import {
  extractAppleMusicId,
  extractDeezerId,
  extractSoundcloudId,
  extractTidalId,
  extractYoutubeMusicId,
  type MusicFetchArtistResult,
} from '@/lib/dsp-enrichment/providers/musicfetch';
import type { ExtractedLink } from '@/lib/ingestion/types';

/** Profile fields that can be enriched from MusicFetch. */
export interface MusicFetchProfileFieldState {
  spotifyUrl: string | null;
  spotifyId: string | null;
  bio: string | null;
  appleMusicUrl: string | null;
  appleMusicId: string | null;
  youtubeUrl: string | null;
  youtubeMusicId: string | null;
  deezerId: string | null;
  tidalId: string | null;
  soundcloudId: string | null;
}

/** DSP ID extraction mappings: serviceKey → profile field + extractor */
const DSP_ID_MAPPINGS: Array<{
  serviceKey: string;
  idField: keyof MusicFetchProfileFieldState;
  extractor: (url: string) => string | null;
}> = [
  { serviceKey: 'deezer', idField: 'deezerId', extractor: extractDeezerId },
  { serviceKey: 'tidal', idField: 'tidalId', extractor: extractTidalId },
  {
    serviceKey: 'soundcloud',
    idField: 'soundcloudId',
    extractor: extractSoundcloudId,
  },
  {
    serviceKey: 'youtubeMusic',
    idField: 'youtubeMusicId',
    extractor: extractYoutubeMusicId,
  },
] as const;

function applyAppleMusicUpdates(
  updates: Partial<Record<keyof MusicFetchProfileFieldState, string>>,
  existingProfile: MusicFetchProfileFieldState,
  appleMusicUrl: string
): void {
  if (!existingProfile.appleMusicId) {
    const appleMusicId = extractAppleMusicId(appleMusicUrl);
    if (appleMusicId) updates.appleMusicId = appleMusicId;
  }
  if (!existingProfile.appleMusicUrl) {
    updates.appleMusicUrl = appleMusicUrl;
  }
}

export function mapMusicFetchProfileFields(
  artistData: MusicFetchArtistResult,
  existingProfile: MusicFetchProfileFieldState,
  spotifyUrl: string,
  spotifyArtistId?: string | null
): Partial<Record<keyof MusicFetchProfileFieldState, string>> {
  const updates: Partial<Record<keyof MusicFetchProfileFieldState, string>> =
    {};
  const services = artistData.services;

  if (!existingProfile.spotifyUrl && spotifyUrl) {
    updates.spotifyUrl = spotifyUrl;
  }

  if (!existingProfile.spotifyId && spotifyArtistId) {
    updates.spotifyId = spotifyArtistId;
  }

  const appleMusicUrl = services.appleMusic?.url;
  if (appleMusicUrl) {
    applyAppleMusicUpdates(updates, existingProfile, appleMusicUrl);
  }

  for (const mapping of DSP_ID_MAPPINGS) {
    const serviceUrl = services[mapping.serviceKey]?.url;
    if (existingProfile[mapping.idField] || !serviceUrl) continue;
    const id = mapping.extractor(serviceUrl);
    if (id) updates[mapping.idField] = id;
  }

  const youtubeUrl = services.youtube?.url || services.youtubeMusic?.url;
  if (!existingProfile.youtubeUrl && youtubeUrl) {
    updates.youtubeUrl = youtubeUrl;
  }

  if (!existingProfile.bio && artistData.bio) {
    updates.bio = artistData.bio;
  }

  return updates;
}

const MUSICFETCH_LINK_MAPPINGS: Array<{
  serviceKey: string;
  platformId: string;
}> = [
  { serviceKey: 'spotify', platformId: 'spotify' },
  { serviceKey: 'appleMusic', platformId: 'apple_music' },
  { serviceKey: 'youtube', platformId: 'youtube' },
  { serviceKey: 'youtubeMusic', platformId: 'youtube_music' },
  { serviceKey: 'soundcloud', platformId: 'soundcloud' },
  { serviceKey: 'bandcamp', platformId: 'bandcamp' },
  { serviceKey: 'amazonMusic', platformId: 'amazon_music' },
  { serviceKey: 'tidal', platformId: 'tidal' },
  { serviceKey: 'deezer', platformId: 'deezer' },
  { serviceKey: 'instagram', platformId: 'instagram' },
  { serviceKey: 'tiktok', platformId: 'tiktok' },
] as const;

export function extractMusicFetchLinks(
  artistData: MusicFetchArtistResult,
  spotifyUrl: string,
  signal: string
): ExtractedLink[] {
  const deduped = new Map<string, ExtractedLink>();

  for (const { serviceKey, platformId } of MUSICFETCH_LINK_MAPPINGS) {
    const url =
      serviceKey === 'spotify'
        ? spotifyUrl
        : artistData.services[serviceKey]?.url;
    if (!url) continue;

    deduped.set(url, {
      url,
      platformId,
      sourcePlatform: 'musicfetch',
      evidence: {
        sources: ['musicfetch'],
        signals: [signal],
      },
    });
  }

  return Array.from(deduped.values());
}
