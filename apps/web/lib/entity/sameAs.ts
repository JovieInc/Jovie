/**
 * Canonical sameAs builder for artist entity schemas.
 *
 * Emits a dense sameAs array suitable for schema.org MusicGroup:
 *   MusicBrainz MBID, Wikidata QID, ISNI, DSP URLs, social URLs.
 *
 * Pure function — no DB access. Accepts pre-fetched identity data.
 */

/** Minimal profile shape required for sameAs resolution */
export interface EntityProfile {
  musicbrainzId?: string | null;
  spotifyUrl?: string | null;
  appleMusicUrl?: string | null;
  youtubeUrl?: string | null;
}

/** A stored identity link (subset of ArtistIdentityLink) */
export interface EntityIdentityLink {
  platform: string;
  url: string;
  externalId?: string | null;
}

/** Social link from the social_links table */
export interface EntitySocialLink {
  platform?: string | null;
  url: string;
}

/** Platforms whose URLs are included in sameAs */
const SAME_AS_PLATFORMS = new Set([
  'spotify',
  'apple_music',
  'youtube',
  'soundcloud',
  'deezer',
  'tidal',
  'amazon_music',
  'bandcamp',
  'instagram',
  'twitter',
  'facebook',
  'tiktok',
  'wikidata',
  'musicbrainz',
]);

/** Normalize an ISNI string to 16 digits (strips spaces/hyphens) */
function normalizeIsni(raw: string): string {
  return raw.replace(/[\s\-]/g, '');
}

/**
 * Build the canonical sameAs array for an artist entity.
 *
 * Order: KB identifiers first (MB, Wikidata, ISNI), then DSPs, then socials.
 */
export function buildEntitySameAs(
  profile: EntityProfile,
  identityLinks: EntityIdentityLink[],
  socialLinks: EntitySocialLink[]
): string[] {
  const urls = new Set<string>();

  // ── Knowledge-base identifiers ───────────────────────────────────────────

  // MusicBrainz MBID → canonical URI
  if (profile.musicbrainzId) {
    urls.add(
      `https://musicbrainz.org/artist/${encodeURIComponent(profile.musicbrainzId)}`
    );
  }

  // Walk identity links for wikidata, isni, musicbrainz, and DSPs
  for (const link of identityLinks) {
    const platform = link.platform.toLowerCase();

    if (platform === 'wikidata') {
      // Prefer the stored URL directly; it is already the canonical Wikidata URI
      if (link.url) urls.add(link.url);
    } else if (platform === 'isni') {
      // externalId holds the raw 16-digit ISNI; build canonical isni.org URL
      if (link.externalId) {
        const normalized = normalizeIsni(link.externalId);
        if (normalized.length === 16) {
          urls.add(`https://isni.org/isni/${normalized}`);
        } else if (link.url) {
          // externalId malformed — fall back to the stored URL
          urls.add(link.url);
        }
      } else if (link.url) {
        urls.add(link.url);
      }
    } else if (platform === 'musicbrainz' && link.externalId) {
      // Secondary MB link from identity store (e.g. from MusicFetch)
      urls.add(
        `https://musicbrainz.org/artist/${encodeURIComponent(link.externalId)}`
      );
    } else if (SAME_AS_PLATFORMS.has(platform) && link.url) {
      urls.add(link.url);
    }
  }

  // ── Profile DSP columns ──────────────────────────────────────────────────
  if (profile.spotifyUrl) urls.add(profile.spotifyUrl);
  if (profile.appleMusicUrl) urls.add(profile.appleMusicUrl);
  if (profile.youtubeUrl) urls.add(profile.youtubeUrl);

  // ── Social links table ───────────────────────────────────────────────────
  for (const link of socialLinks) {
    if (!link.url) continue;
    const platform = (link.platform ?? '').toLowerCase();
    if (SAME_AS_PLATFORMS.has(platform)) {
      urls.add(link.url);
    }
  }

  return [...urls];
}
