/**
 * Shared metadata builder for public profile routes.
 *
 * Provides `buildPublicProfileMetadata` (the canonical metadata factory) and
 * helpers consumed by every `generateMetadata` export under `app/[username]`.
 *
 * Design constraints:
 * - No Next.js `cookies()` or `headers()` — all callers are ISR-compatible.
 * - Artist-provided text (bio, display_name) is sanitized before use in title/
 *   description to prevent XSS via crafted artist content in og:title etc.
 * - Missing / unpublished profiles return intentional, non-leaking metadata
 *   (PROFILE_NOT_FOUND_METADATA or PROFILE_ERROR_METADATA).
 * - OG image is provided by the co-located `opengraph-image.tsx` via the
 *   Next.js App Router file convention; this builder does not need to emit an
 *   images array for the root profile route.
 */

import type { Metadata } from 'next';
import { APP_NAME, BASE_URL } from '@/constants/app';
import type { CreatorProfile } from '@/types/db';

// ---------------------------------------------------------------------------
// Sanitization
// ---------------------------------------------------------------------------

/**
 * Strip HTML tags and collapse whitespace from a string so that artist-supplied
 * bio/name text cannot inject markup into metadata attributes.
 *
 * Next.js escapes metadata strings when emitting `<meta>` tags, but stripping
 * tags up-front keeps values clean for any future path that might not escape
 * them (e.g. a hand-rolled `<head>` or a third-party preview API).
 *
 * This is intentionally minimal — it replaces `<tags>` and normalizes
 * whitespace. It does NOT attempt to allow any subset of HTML.
 */
function stripHtmlTags(value: string) {
  let result = '';
  let index = 0;

  while (index < value.length) {
    const char = value.charAt(index);
    if (char === '<') {
      const closeIndex = value.indexOf('>', index + 1);
      if (closeIndex === -1) {
        result += char;
        index += 1;
        continue;
      }

      result += ' ';
      index = closeIndex + 1;
      continue;
    }

    result += char;
    index += 1;
  }

  return result;
}

export function sanitizeMetadataText(value: string | null | undefined): string {
  if (!value) return '';
  // Remove HTML tags
  const stripped = stripHtmlTags(value);
  // Collapse multiple whitespace chars into a single space and trim
  return stripped.replace(/\s+/g, ' ').trim();
}

/**
 * Truncate a string to `maxLen` characters, appending `…` when trimmed.
 * Never truncates mid-word when possible (walks back to the last space).
 */
export function truncateMetadataText(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  const truncated = value.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(' ');
  return (
    (lastSpace > maxLen * 0.75 ? truncated.slice(0, lastSpace) : truncated) +
    '…'
  );
}

// ---------------------------------------------------------------------------
// Description builder
// ---------------------------------------------------------------------------

/**
 * Build the SEO description for a public artist profile page.
 *
 * Priority order:
 * 1. Bio snippet (first 155 chars) + genre suffix + streaming CTA
 * 2. Genre + location descriptor + streaming CTA
 * 3. Plain streaming CTA
 */
export function buildProfileDescription(
  artistName: string,
  bio: string | null | undefined,
  location: string | null | undefined,
  genres: string[] | null | undefined
): string {
  const cleanBio = sanitizeMetadataText(bio);
  const cleanLocation = sanitizeMetadataText(location);
  // Sanitize and filter genres once so empty strings (e.g. "<script>" → "") are
  // excluded from the final composition rather than producing awkward fragments.
  const cleanGenres =
    genres?.map(g => sanitizeMetadataText(g)).filter(Boolean) ?? [];

  if (cleanBio) {
    const snippet = truncateMetadataText(cleanBio, 155);
    const genreSuffix =
      cleanGenres.length > 0
        ? `. ${cleanGenres.slice(0, 3).join(', ')} artist`
        : '';
    return `${snippet}${genreSuffix}. Stream on Spotify, Apple Music & more on ${APP_NAME}.`;
  }

  const locationPrefix = cleanLocation ? `${cleanLocation}-based ` : '';
  const genreText =
    cleanGenres.length > 0 ? `${cleanGenres.slice(0, 3).join(', ')} ` : '';
  const descriptor = `${locationPrefix}${genreText}`.trim();
  return descriptor
    ? `${descriptor} artist. Stream ${artistName}'s music on Spotify, Apple Music & more on ${APP_NAME}.`
    : `Stream ${artistName}'s music on Spotify, Apple Music & more on ${APP_NAME}.`;
}

// ---------------------------------------------------------------------------
// Canonical URL builder
// ---------------------------------------------------------------------------

/**
 * Return the canonical public profile URL for a given username (normalized).
 * Uses `username_normalized` when available, otherwise lowercases `username`.
 */
export function buildProfileCanonicalUrl(profile: {
  username: string;
  username_normalized?: string | null;
}): string {
  const slug = profile.username_normalized ?? profile.username.toLowerCase();
  return `${BASE_URL}/${slug}`;
}

// ---------------------------------------------------------------------------
// Metadata factory
// ---------------------------------------------------------------------------

/**
 * Inputs required by `buildPublicProfileMetadata`. Subset of `CreatorProfile`
 * plus the resolved `genres` array (not stored on the profile directly).
 */
export interface PublicProfileMetadataInput {
  readonly profile: Pick<
    CreatorProfile,
    | 'username'
    | 'username_normalized'
    | 'display_name'
    | 'bio'
    | 'location'
    | 'avatar_url'
    | 'is_verified'
  >;
  readonly genres: string[] | null | undefined;
}

/**
 * Build a `Metadata` object for the root public profile page.
 * Consumed by `generateMetadata` in `app/[username]/page.tsx` and
 * optionally by child routes that want the same canonical metadata shape.
 *
 * - Sanitizes all artist-provided strings before embedding them.
 * - Sets `alternates.canonical` to the normalized profile URL.
 * - Sets full Open Graph + Twitter Card metadata.
 * - Includes `robots` allowing indexing for published profiles.
 */
export function buildPublicProfileMetadata(
  input: PublicProfileMetadataInput
): Metadata {
  const { profile, genres } = input;

  // Sanitize display_name and username independently so the fallback chain
  // never reintroduces unsanitized artist-provided text into metadata fields.
  const artistName =
    sanitizeMetadataText(profile.display_name) ||
    sanitizeMetadataText(profile.username) ||
    APP_NAME;

  const canonicalUrl = buildProfileCanonicalUrl(profile);
  const socialTitle = `${artistName} | ${APP_NAME}`;
  const description = buildProfileDescription(
    artistName,
    profile.bio,
    profile.location,
    genres
  );

  const baseKeywords = [
    artistName,
    `${artistName} music`,
    `${artistName} songs`,
    `${artistName} artist`,
    'music artist',
    'streaming links',
    'spotify',
    'apple music',
  ];
  const genreKeywords =
    genres?.slice(0, 5).map(g => sanitizeMetadataText(g)) ?? [];
  const keywords = [...baseKeywords, ...genreKeywords].filter(Boolean);

  return {
    title: artistName,
    description,
    keywords,
    authors: [{ name: artistName }],
    creator: artistName,
    metadataBase: new URL(BASE_URL),
    alternates: {
      canonical: canonicalUrl,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    openGraph: {
      type: 'profile',
      title: socialTitle,
      description,
      url: canonicalUrl,
      siteName: APP_NAME,
      locale: 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description,
      creator: '@jovieapp',
      site: '@jovieapp',
    },
    other: {
      ...(profile.is_verified && { 'profile:verified': 'true' }),
      // Use the sanitized value for both the truthy check and the emitted value
      // so an HTML-only location string (e.g. "<b></b>") doesn't produce a
      // blank geo.placename entry.
      ...(sanitizeMetadataText(profile.location) && {
        'geo.placename': sanitizeMetadataText(profile.location),
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// Static fallback metadata objects
// ---------------------------------------------------------------------------

/**
 * Returned by `generateMetadata` when the profile does not exist (404).
 * Does not leak any artist-specific data.
 */
export const PROFILE_NOT_FOUND_METADATA: Metadata = {
  title: 'Profile Not Found',
  description: 'The requested profile could not be found.',
  robots: { index: false, follow: false },
};

/**
 * Returned by `generateMetadata` when the profile fetch errors out (500).
 * Intentionally vague — reveals nothing about internal state.
 */
export const PROFILE_ERROR_METADATA: Metadata = {
  title: 'Profile temporarily unavailable',
  description: 'We are working to restore this profile. Please try again.',
  robots: { index: false, follow: false },
};

/**
 * Metadata for routes that issue HTTP redirects before rendering any UI.
 * Prevents redirect-sink routes from being independently indexed.
 */
export const REDIRECT_SINK_METADATA: Metadata = {
  robots: { index: false, follow: false },
};
