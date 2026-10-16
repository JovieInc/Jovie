import { ImageResponse } from 'next/og';
import { sanitizeMetadataText } from '@/lib/profile/metadata';
import { resolveOpaqueInternalProfileUsername } from '@/lib/profile/opaque-internal-profile-handle.server';
import { withTimeout } from '@/lib/resilience/primitives';
import { getProfileWithLinks } from '@/lib/services/profile';
import { loadSatoshiFont, OG_SIZE } from '@/lib/share/image-utils';
import { renderProfileShareCard } from '@/lib/share/profile-card';
import { loadProfileShareImage } from '@/lib/share/profile-image';
import {
  isReservedUsername,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from '@/lib/validation/username-core';

export const runtime = 'nodejs';
// An old image URL must check current publication, including after revocation.
export const revalidate = 0;
export const alt = 'Public profile preview';
export const size = OG_SIZE;
export const contentType = 'image/png';

const HEADERS = { 'Cache-Control': 'no-store' };

async function resolvePublicProfile(username: string) {
  if (
    username.length < USERNAME_MIN_LENGTH ||
    username.length > USERNAME_MAX_LENGTH ||
    !USERNAME_PATTERN.test(username) ||
    isReservedUsername(username)
  ) {
    return null;
  }
  const decision = await resolveOpaqueInternalProfileUsername(username);
  if (decision.action === 'not_found') return null;
  const canonicalUsername =
    decision.action === 'redirect' ? decision.handle : username;
  const profile = await getProfileWithLinks(canonicalUsername, {
    skipCache: true,
  });
  return profile?.isPublic ? profile : null;
}

export default async function Image({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  let profile: Awaited<ReturnType<typeof resolvePublicProfile>> = null;
  let status = 200;
  try {
    profile = await withTimeout(resolvePublicProfile(username.toLowerCase()), {
      timeoutMs: 3000,
      context: 'profile share snapshot',
    });
    if (!profile) status = 404;
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

  const fullName = profile
    ? sanitizeMetadataText(profile.displayName) ||
      sanitizeMetadataText(profile.username)
    : 'Profile unavailable';
  // Extreme display names use their exact public handle instead of clipping
  // words or shrinking below chat legibility. Page metadata keeps the full name.
  const publicHandle = sanitizeMetadataText(
    profile?.usernameNormalized || profile?.username
  );
  const name = fullName.length > 110 ? publicHandle : fullName;
  const image =
    profile?.avatarUrl && name.length <= 32
      ? await loadProfileShareImage(profile.avatarUrl)
      : null;

  return new ImageResponse(
    renderProfileShareCard({
      name,
      handle: publicHandle || undefined,
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
