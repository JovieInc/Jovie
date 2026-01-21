/**
 * Candidate Extractor
 *
 * Extracts avatar candidates from various platform URLs.
 */

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

/**
 * Extract an avatar candidate from a link URL.
 *
 * Tries platform-specific extraction first, then falls back to OG/Twitter meta tags.
 */
export async function extractAvatarCandidateFromLinkUrl(
  url: string
): Promise<AvatarCandidate | null> {
  const normalized = normalizeUrl(url);

  const linktree = validateLinktreeUrl(normalized);
  if (linktree) {
    const html = await fetchLinktreeDocument(linktree);
    const extracted = extractLinktree(html);
    const avatarUrl = sanitizeHttpsUrl(extracted.avatarUrl);
    return avatarUrl ? { avatarUrl, sourcePlatform: 'linktree' } : null;
  }

  const beacons = validateBeaconsUrl(normalized);
  if (beacons) {
    const html = await fetchBeaconsDocument(beacons);
    const extracted = extractBeacons(html);
    const avatarUrl = sanitizeHttpsUrl(extracted.avatarUrl);
    return avatarUrl ? { avatarUrl, sourcePlatform: 'beacons' } : null;
  }

  const layloHandle = extractLayloHandle(normalized);
  if (layloHandle) {
    const { profile, user } = await fetchLayloProfile(layloHandle);
    const extracted = extractLaylo(profile, user);
    const avatarUrl = sanitizeHttpsUrl(extracted.avatarUrl);
    return avatarUrl ? { avatarUrl, sourcePlatform: 'laylo' } : null;
  }

  const youtube = validateYouTubeChannelUrl(normalized);
  if (youtube) {
    const html = await fetchYouTubeAboutDocument(youtube);
    const extracted = extractYouTube(html);
    const avatarUrl = sanitizeHttpsUrl(extracted.avatarUrl);
    return avatarUrl ? { avatarUrl, sourcePlatform: 'youtube' } : null;
  }

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
