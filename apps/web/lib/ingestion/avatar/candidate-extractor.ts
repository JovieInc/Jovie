/**
 * Candidate Extractor
 *
 * Extracts avatar candidates from various platform URLs.
 * Supports both link-in-bio platforms and major DSPs.
 */

import {
  extractAppleMusicImageUrls,
  extractDeezerImageUrls,
  extractSpotifyImageUrls,
  getAppleMusicArtist,
  getDeezerArtist,
  getSpotifyArtistProfile,
  isAppleMusicAvailable,
  isDeezerAvailable,
  isSpotifyAvailable,
} from '@/lib/dsp-enrichment/providers';
import { normalizeUrl } from '@/lib/utils/platform-detection';
import { extractMetaContent, fetchDocument } from '../strategies/base';
import {
  extractBeacons,
  fetchBeaconsDocument,
  validateBeaconsUrl,
} from '../strategies/beacons';
import {
  extractLaylo,
  extractLayloHandle,
  fetchLayloProfile,
} from '../strategies/laylo';
import {
  extractLinktree,
  fetchLinktreeDocument,
  validateLinktreeUrl,
} from '../strategies/linktree';
import {
  extractYouTube,
  fetchYouTubeAboutDocument,
  validateYouTubeChannelUrl,
} from '../strategies/youtube';
import { FALLBACK_FETCH_TIMEOUT_MS } from './constants';
import { sanitizeHttpsUrl } from './http-client';
import type { AvatarCandidate } from './types';

// ============================================================================
// DSP URL Validation
// ============================================================================

/**
 * Extract Spotify artist ID from a Spotify URL.
 * Handles: open.spotify.com/artist/{id}, spotify:artist:{id}
 */
function extractSpotifyArtistId(url: string): string | null {
  try {
    // Handle spotify: URI format
    if (url.startsWith('spotify:artist:')) {
      return url.replace('spotify:artist:', '');
    }

    const parsed = new URL(url);
    if (
      parsed.hostname === 'open.spotify.com' ||
      parsed.hostname === 'spotify.com'
    ) {
      const match = /\/artist\/([a-zA-Z0-9]+)/.exec(parsed.pathname);
      return match?.[1] ?? null;
    }
  } catch {
    // Invalid URL
  }
  return null;
}

/**
 * Extract Apple Music artist ID from an Apple Music URL.
 * Handles: music.apple.com/{storefront}/artist/{name}/{id}
 */
function extractAppleMusicArtistId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (
      parsed.hostname === 'music.apple.com' ||
      parsed.hostname === 'itunes.apple.com'
    ) {
      // Format: /us/artist/artist-name/123456789
      const match = /\/artist\/[^/]+\/(\d+)/.exec(parsed.pathname);
      return match?.[1] ?? null;
    }
  } catch {
    // Invalid URL
  }
  return null;
}

/**
 * Extract Deezer artist ID from a Deezer URL.
 * Handles: deezer.com/artist/{id}, deezer.com/{locale}/artist/{id}
 */
function extractDeezerArtistId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (
      parsed.hostname === 'www.deezer.com' ||
      parsed.hostname === 'deezer.com'
    ) {
      // Format: /artist/123 or /en/artist/123
      const match = /\/artist\/(\d+)/.exec(parsed.pathname);
      return match?.[1] ?? null;
    }
  } catch {
    // Invalid URL
  }
  return null;
}

// ============================================================================
// DSP Avatar Extraction
// ============================================================================

/**
 * Extract avatar from Spotify artist URL.
 */
async function extractSpotifyAvatar(
  url: string
): Promise<AvatarCandidate | null> {
  if (!isSpotifyAvailable()) {
    return null;
  }

  const artistId = extractSpotifyArtistId(url);
  if (!artistId) {
    return null;
  }

  try {
    const artist = await getSpotifyArtistProfile(artistId);
    if (!artist) return null;

    const imageUrls = extractSpotifyImageUrls(artist.images);
    const avatarUrl = sanitizeHttpsUrl(
      imageUrls?.large || imageUrls?.original || null
    );

    return avatarUrl ? { avatarUrl, sourcePlatform: 'spotify' } : null;
  } catch {
    return null;
  }
}

/**
 * Extract avatar from Apple Music artist URL.
 */
async function extractAppleMusicAvatar(
  url: string
): Promise<AvatarCandidate | null> {
  if (!isAppleMusicAvailable()) {
    return null;
  }

  const artistId = extractAppleMusicArtistId(url);
  if (!artistId) {
    return null;
  }

  try {
    const artist = await getAppleMusicArtist(artistId);
    if (!artist) return null;

    const imageUrls = extractAppleMusicImageUrls(artist.attributes.artwork);
    const avatarUrl = sanitizeHttpsUrl(
      imageUrls?.large || imageUrls?.original || null
    );

    return avatarUrl ? { avatarUrl, sourcePlatform: 'apple_music' } : null;
  } catch {
    return null;
  }
}

/**
 * Extract avatar from Deezer artist URL.
 */
async function extractDeezerAvatar(
  url: string
): Promise<AvatarCandidate | null> {
  if (!isDeezerAvailable()) {
    return null;
  }

  const artistId = extractDeezerArtistId(url);
  if (!artistId) {
    return null;
  }

  try {
    const artist = await getDeezerArtist(artistId);
    if (!artist) return null;

    const imageUrls = extractDeezerImageUrls(artist);
    const avatarUrl = sanitizeHttpsUrl(
      imageUrls?.large || imageUrls?.original || null
    );

    return avatarUrl ? { avatarUrl, sourcePlatform: 'deezer' } : null;
  } catch {
    return null;
  }
}

async function tryExtractFromLinktree(
  normalized: string
): Promise<AvatarCandidate | null> {
  const linktree = validateLinktreeUrl(normalized);
  if (!linktree) return null;

  const html = await fetchLinktreeDocument(linktree);
  const extracted = extractLinktree(html);
  const avatarUrl = sanitizeHttpsUrl(extracted.avatarUrl);
  return avatarUrl ? { avatarUrl, sourcePlatform: 'linktree' } : null;
}

async function tryExtractFromBeacons(
  normalized: string
): Promise<AvatarCandidate | null> {
  const beacons = validateBeaconsUrl(normalized);
  if (!beacons) return null;

  const html = await fetchBeaconsDocument(beacons);
  const extracted = extractBeacons(html);
  const avatarUrl = sanitizeHttpsUrl(extracted.avatarUrl);
  return avatarUrl ? { avatarUrl, sourcePlatform: 'beacons' } : null;
}

async function tryExtractFromLaylo(
  normalized: string
): Promise<AvatarCandidate | null> {
  const layloHandle = extractLayloHandle(normalized);
  if (!layloHandle) return null;

  const { profile, user } = await fetchLayloProfile(layloHandle);
  const extracted = extractLaylo(profile, user);
  const avatarUrl = sanitizeHttpsUrl(extracted.avatarUrl);
  return avatarUrl ? { avatarUrl, sourcePlatform: 'laylo' } : null;
}

async function tryExtractFromYouTube(
  normalized: string
): Promise<AvatarCandidate | null> {
  const youtube = validateYouTubeChannelUrl(normalized);
  if (!youtube) return null;

  const html = await fetchYouTubeAboutDocument(youtube);
  const extracted = extractYouTube(html);
  const avatarUrl = sanitizeHttpsUrl(extracted.avatarUrl);
  return avatarUrl ? { avatarUrl, sourcePlatform: 'youtube' } : null;
}

async function tryExtractFromDSPs(
  normalized: string
): Promise<AvatarCandidate | null> {
  const spotifyArtistId = extractSpotifyArtistId(normalized);
  if (spotifyArtistId) {
    const spotifyAvatar = await extractSpotifyAvatar(normalized);
    if (spotifyAvatar) return spotifyAvatar;
  }

  const appleMusicArtistId = extractAppleMusicArtistId(normalized);
  if (appleMusicArtistId) {
    const appleMusicAvatar = await extractAppleMusicAvatar(normalized);
    if (appleMusicAvatar) return appleMusicAvatar;
  }

  const deezerArtistId = extractDeezerArtistId(normalized);
  if (deezerArtistId) {
    const deezerAvatar = await extractDeezerAvatar(normalized);
    if (deezerAvatar) return deezerAvatar;
  }

  return null;
}

async function tryExtractFromMetaTags(
  normalized: string
): Promise<AvatarCandidate | null> {
  const parsed = new URL(normalized);
  const host = parsed.hostname.toLowerCase();
  const variant = host.startsWith('www.') ? host.slice(4) : `www.${host}`;
  const { html } = await fetchDocument(normalized, {
    timeoutMs: FALLBACK_FETCH_TIMEOUT_MS,
    maxRetries: 1,
    allowedHosts: new Set([host, variant]),
  });

  const ogImage = sanitizeHttpsUrl(extractMetaContent(html, 'og:image'));
  if (ogImage) {
    return { avatarUrl: ogImage, sourcePlatform: 'web' };
  }

  const twitterImage = sanitizeHttpsUrl(
    extractMetaContent(html, 'twitter:image')
  );
  if (twitterImage) {
    return { avatarUrl: twitterImage, sourcePlatform: 'web' };
  }

  return null;
}

/**
 * Extract an avatar candidate from a link URL.
 *
 * Tries platform-specific extraction first, then falls back to OG/Twitter meta tags.
 */
export async function extractAvatarCandidateFromLinkUrl(
  url: string
): Promise<AvatarCandidate | null> {
  const normalized = normalizeUrl(url);

  // Try platform-specific extractors in sequence
  const extractors = [
    tryExtractFromLinktree,
    tryExtractFromBeacons,
    tryExtractFromLaylo,
    tryExtractFromYouTube,
    tryExtractFromDSPs,
    tryExtractFromMetaTags,
  ];

  for (const extractor of extractors) {
    const result = await extractor(normalized);
    if (result) return result;
  }

  return null;
}

// ============================================================================
// Direct DSP Avatar Extraction (by ID)
// ============================================================================

/**
 * Extract avatar directly from a Spotify artist ID.
 * Use this when you have the artist ID but not a URL.
 */
export async function extractAvatarFromSpotifyId(
  artistId: string
): Promise<AvatarCandidate | null> {
  return extractSpotifyAvatar(`https://open.spotify.com/artist/${artistId}`);
}

/**
 * Extract avatar directly from an Apple Music artist ID.
 * Use this when you have the artist ID but not a URL.
 */
export async function extractAvatarFromAppleMusicId(
  artistId: string
): Promise<AvatarCandidate | null> {
  return extractAppleMusicAvatar(
    `https://music.apple.com/us/artist/a/${artistId}`
  );
}

/**
 * Extract avatar directly from a Deezer artist ID.
 * Use this when you have the artist ID but not a URL.
 */
export async function extractAvatarFromDeezerId(
  artistId: string | number
): Promise<AvatarCandidate | null> {
  return extractDeezerAvatar(`https://www.deezer.com/artist/${artistId}`);
}

/**
 * Extract avatars from all connected DSPs for a profile.
 * Returns all found candidates, sorted by platform priority.
 */
export async function extractAvatarsFromConnectedDsps(params: {
  spotifyId?: string | null;
  appleMusicId?: string | null;
  deezerId?: string | null;
}): Promise<AvatarCandidate[]> {
  const { spotifyId, appleMusicId, deezerId } = params;
  const candidates: AvatarCandidate[] = [];

  // Fetch from all available DSPs in parallel
  const promises: Promise<void>[] = [];

  if (spotifyId) {
    promises.push(
      extractAvatarFromSpotifyId(spotifyId).then(c => {
        if (c) candidates.push(c);
      })
    );
  }

  if (appleMusicId) {
    promises.push(
      extractAvatarFromAppleMusicId(appleMusicId).then(c => {
        if (c) candidates.push(c);
      })
    );
  }

  if (deezerId) {
    promises.push(
      extractAvatarFromDeezerId(deezerId).then(c => {
        if (c) candidates.push(c);
      })
    );
  }

  await Promise.allSettled(promises);

  // Sort by platform priority (Spotify > Apple Music > Deezer)
  const platformPriority: Record<string, number> = {
    spotify: 1,
    apple_music: 2,
    deezer: 3,
  };

  return candidates.sort((a, b) => {
    const aPriority = platformPriority[a.sourcePlatform] ?? 99;
    const bPriority = platformPriority[b.sourcePlatform] ?? 99;
    return aPriority - bPriority;
  });
}

// Export ID extraction functions for reuse
export {
  extractAppleMusicArtistId,
  extractDeezerArtistId,
  extractSpotifyArtistId,
};
