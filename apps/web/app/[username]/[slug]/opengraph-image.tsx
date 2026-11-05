import { ImageResponse } from 'next/og';
import { connection } from 'next/server';
import { resolveSmartLinkArtistByline } from '@/lib/discography/release-credits';
import { determineReleasePhase } from '@/lib/discography/release-phase';
import { resolveOpaqueInternalProfileUsername } from '@/lib/profile/opaque-internal-profile-handle.server';
import { withTimeout } from '@/lib/resilience/primitives';
import { buildDisplayUrl } from '@/lib/share/copy';
import { loadSatoshiFont, OG_SIZE, toDataUrl } from '@/lib/share/image-utils';
import { renderReleaseShareCard } from '@/lib/share/release-card';
import {
  isReservedUsername,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from '@/lib/validation/username-core';
import { getContentBySlug, getCreatorByUsername } from './_lib/data';

export const runtime = 'nodejs';
// Dynamic by request-time connection (no route-segment cache export: the
// stack-pattern ratchet caps those): an old image URL must check current
// publication, including after revocation.
export const alt = 'Release share card on Jovie with artwork, title and artist';
export const size = OG_SIZE;
export const contentType = 'image/png';

const HEADERS = { 'Cache-Control': 'no-store' };

async function resolvePublicRelease(username: string, slug: string) {
  if (
    username.length < USERNAME_MIN_LENGTH ||
    username.length > USERNAME_MAX_LENGTH ||
    !USERNAME_PATTERN.test(username) ||
    isReservedUsername(username) ||
    !/^[a-z0-9-]+$/.test(slug)
  ) {
    return null;
  }
  const decision = await resolveOpaqueInternalProfileUsername(username);
  if (decision.action === 'not_found') return null;
  const canonicalUsername =
    decision.action === 'redirect' ? decision.handle : username;
  const creator = await getCreatorByUsername(canonicalUsername);
  if (!creator) return null;
  const content = await getContentBySlug(creator.id, slug);
  if (!content) return null;
  return { creator, content };
}

export default async function Image({
  params,
}: {
  params: Promise<{ username: string; slug: string }>;
}) {
  const { username, slug } = await params;
  await connection();
  let resolved: Awaited<ReturnType<typeof resolvePublicRelease>> = null;
  let status = 200;
  try {
    resolved = await withTimeout(
      resolvePublicRelease(username.toLowerCase(), slug.toLowerCase()),
      {
        timeoutMs: 3000,
        context: 'release share snapshot',
      }
    );
    if (!resolved) status = 404;
  } catch {
    status = 503;
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

  // Mystery releases never reveal artwork or title (matches the page's
  // metadata suppression): the card only says something new is coming.
  const phase = resolved
    ? determineReleasePhase(
        resolved.content.releaseDate,
        resolved.content.revealDate
      )
    : null;
  const isMystery = phase === 'mystery';

  const artistName = resolved
    ? resolveSmartLinkArtistByline({
        primaryArtists: resolved.content.primaryArtists,
        ownerName: resolved.creator.displayName ?? resolved.creator.username,
        ownerHandle: resolved.creator.usernameNormalized,
      }).text
    : '';
  const title = resolved
    ? isMystery
      ? `New music from ${artistName}`
      : resolved.content.title
    : 'Release unavailable';
  const urlText = resolved
    ? buildDisplayUrl(
        `/${resolved.creator.usernameNormalized}/${resolved.content.slug}`
      )
    : 'jov.ie';
  const image =
    resolved && !isMystery && resolved.content.artworkUrl
      ? await toDataUrl(resolved.content.artworkUrl)
      : null;

  return new ImageResponse(
    renderReleaseShareCard({
      title,
      artistName,
      urlText,
      image,
    }),
    {
      ...size,
      status,
      headers: HEADERS,
      fonts: [{ name: 'Satoshi', data: font, weight: 700, style: 'normal' }],
    }
  );
}
