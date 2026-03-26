import {
  extractAppleMusicId,
  extractDeezerId,
  extractSoundcloudId,
  extractTidalId,
  extractYoutubeMusicId,
  getMusicFetchServiceUrl,
  type MusicFetchArtistResult,
} from '@/lib/dsp-enrichment/providers/musicfetch';
import {
  MUSICFETCH_LINK_MAPPINGS,
  MUSICFETCH_SERVICE_TO_DSP,
} from '@/lib/dsp-registry';
import type { RawIdentityLink } from '@/lib/identity/store';
import type { ExtractedLink } from '@/lib/ingestion/types';

/** Profile fields that can be enriched from MusicFetch. */
export interface MusicFetchProfileFieldState {
  spotifyUrl: string | null;
  spotifyId: string | null;
  bio: string | null;
  avatarUrl: string | null;
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

function applySpotifyUpdates(
  updates: Partial<Record<keyof MusicFetchProfileFieldState, string>>,
  existingProfile: MusicFetchProfileFieldState,
  spotifyUrl: string,
  spotifyArtistId?: string | null
): void {
  if (!existingProfile.spotifyUrl && spotifyUrl) {
    updates.spotifyUrl = spotifyUrl;
  }
  if (!existingProfile.spotifyId && spotifyArtistId) {
    updates.spotifyId = spotifyArtistId;
  }
}

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

  applySpotifyUpdates(updates, existingProfile, spotifyUrl, spotifyArtistId);

  const appleMusicUrl = getMusicFetchServiceUrl(services.appleMusic);
  if (appleMusicUrl) {
    applyAppleMusicUpdates(updates, existingProfile, appleMusicUrl);
  }

  for (const mapping of DSP_ID_MAPPINGS) {
    const serviceUrl = getMusicFetchServiceUrl(services[mapping.serviceKey]);
    if (existingProfile[mapping.idField] || !serviceUrl) continue;
    const id = mapping.extractor(serviceUrl);
    if (id) updates[mapping.idField] = id;
  }

  const youtubeUrl =
    getMusicFetchServiceUrl(services.youtube) ||
    getMusicFetchServiceUrl(services.youtubeMusic);
  if (!existingProfile.youtubeUrl && youtubeUrl) {
    updates.youtubeUrl = youtubeUrl;
  }

  if (!existingProfile.bio && artistData.bio) {
    updates.bio = artistData.bio;
  }

  if (!existingProfile.avatarUrl && artistData.image?.url) {
    updates.avatarUrl = artistData.image.url;
  }

  return updates;
}

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
        : getMusicFetchServiceUrl(artistData.services[serviceKey]);
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

/**
 * Extract ALL services from a MusicFetch response for the identity layer.
 * Unlike extractMusicFetchLinks (streaming-only), this returns every platform
 * with a valid URL — streaming, video, metadata, social — preserving the raw
 * service object as payload.
 */
export function extractAllMusicFetchServices(
  artistData: MusicFetchArtistResult,
  spotifyUrl?: string
): RawIdentityLink[] {
  const links: RawIdentityLink[] = [];
  const seen = new Set<string>();

  for (const [serviceKey, service] of Object.entries(artistData.services)) {
    const url = getMusicFetchServiceUrl(service);
    if (!url) continue;

    // Map MusicFetch service key to DSP registry key
    const dspEntry = MUSICFETCH_SERVICE_TO_DSP.get(serviceKey);
    const platform = dspEntry?.key ?? serviceKey;

    // Deduplicate by platform
    if (seen.has(platform)) continue;
    seen.add(platform);

    links.push({
      platform,
      url,
      externalId: service.id ?? null,
      rawPayload: { ...service },
    });
  }

  // Add Spotify from the known URL if not already in services
  if (spotifyUrl && !seen.has('spotify')) {
    links.push({
      platform: 'spotify',
      url: spotifyUrl,
      rawPayload: {},
    });
  }

  return links;
}
