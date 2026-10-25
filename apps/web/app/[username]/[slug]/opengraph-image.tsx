import { ImageResponse } from 'next/og';
import { resolveSmartLinkArtistByline } from '@/lib/discography/release-credits';
import { determineReleasePhase } from '@/lib/discography/release-phase';
import { sanitizeMetadataText } from '@/lib/profile/metadata';
import { resolveOpaqueInternalProfileUsername } from '@/lib/profile/opaque-internal-profile-handle.server';
import { withTimeout } from '@/lib/resilience/primitives';
import { loadSatoshiFont, OG_SIZE } from '@/lib/share/image-utils';
import { renderReleaseShareCard } from '@/lib/share/release-card';
import { loadReleaseShareArtwork } from '@/lib/share/release-image';
import {
  isReservedUsername,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from '@/lib/validation/username-core';
import { getContentBySlug, getCreatorByUsername } from './_lib/data';

export const runtime = 'nodejs';
// An old image URL must recheck current publication, including revocation
// and phase changes, instead of serving a stale composed preview.
export const revalidate = 0;
export const alt = 'Public release preview';
export const size = OG_SIZE;
export const contentType = 'image/png';

const HEADERS = { 'Cache-Control': 'no-store' };
const SLUG_PATTERN = /^[a-z0-9-]+$/;

interface ResolvedRelease {
  readonly handle: string;
  readonly slug: string;
  /** Present for revealed content; null keeps mystery titles and sleeves hidden. */
  readonly title: string | null;
  readonly artist: string;
  readonly typeLabel: string;
  readonly year: number | null;
  readonly artworkUrl: string | null;
}

async function resolvePublicRelease(
  username: string,
  slug: string
): Promise<ResolvedRelease | null> {
  const decision = await resolveOpaqueInternalProfileUsername(username);
  if (decision.action === 'not_found') return null;
  const canonicalUsername =
    decision.action === 'redirect' ? decision.handle : username;
  const creator = await getCreatorByUsername(canonicalUsername);
  if (!creator) return null;
  const content = await getContentBySlug(creator.id, slug);
  if (!content) return null;

  const artist = sanitizeMetadataText(
    resolveSmartLinkArtistByline({
      primaryArtists: content.primaryArtists,
      ownerName: creator.displayName ?? creator.username,
      ownerHandle: creator.usernameNormalized,
    }).text
  );
  const year = content.releaseDate
    ? new Date(content.releaseDate).getFullYear()
    : null;

  // Mystery releases keep their title and sleeve hidden; the preview mirrors
  // the page metadata's safe "new music" wording instead of leaking them.
  const phase = determineReleasePhase(content.releaseDate, content.revealDate);
  if (phase === 'mystery') {
    return {
      handle: creator.usernameNormalized,
      slug: content.slug,
      title: null,
      artist: `New music from ${artist}`,
      typeLabel: 'coming soon',
      year: null,
      artworkUrl: null,
    };
  }
  return {
    handle: creator.usernameNormalized,
    slug: content.slug,
    title: sanitizeMetadataText(content.title),
    artist,
    typeLabel: content.type === 'release' ? 'album' : 'song',
    year,
    artworkUrl:
      content.artworkSizes?.['1000'] ??
      content.artworkSizes?.original ??
      content.artworkUrl,
  };
}

export default async function Image({
  params,
}: {
  params: Promise<{ username: string; slug: string }>;
}) {
  const { username, slug } = await params;
  const normalizedUsername = username.toLowerCase();
  let release: Awaited<ReturnType<typeof resolvePublicRelease>> = null;
  let status = 200;
  if (
    normalizedUsername.length < USERNAME_MIN_LENGTH ||
    normalizedUsername.length > USERNAME_MAX_LENGTH ||
    !USERNAME_PATTERN.test(normalizedUsername) ||
    isReservedUsername(normalizedUsername) ||
    !SLUG_PATTERN.test(slug)
  ) {
    status = 404;
  } else {
    try {
      release = await withTimeout(
        resolvePublicRelease(normalizedUsername, slug),
        {
          timeoutMs: 3000,
          context: 'release share snapshot',
        }
      );
      if (!release) status = 404;
    } catch {
      status = 503;
    }
  }

  let font: ArrayBuffer;
  try {
    font = await loadSatoshiFont();
  } catch {
    return new Response('Preview unavailable', {
      status: 503,
      headers: HEADERS,
    });
  }

  const revealed = Boolean(release?.title);
  const artwork = await (release && revealed && release.artworkUrl
    ? loadReleaseShareArtwork(release.artworkUrl)
    : null);

  return new ImageResponse(
    renderReleaseShareCard({
      title: release
        ? (release.title ?? release.artist)
        : 'Release unavailable',
      artist: release && revealed ? release.artist : '',
      typeLabel: release ? release.typeLabel : 'jov.ie',
      year: release && revealed ? release.year : null,
      handle: release ? release.handle : undefined,
      slug: release ? release.slug : undefined,
      artwork,
    }),
    {
      ...size,
      status,
      headers: HEADERS,
      fonts: [{ name: 'Satoshi', data: font, weight: 700, style: 'normal' }],
    }
  );
}
