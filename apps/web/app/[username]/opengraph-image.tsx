import { ImageResponse } from 'next/og';
import { getReleaseStatsByUsername } from '@/lib/discography/queries';
import {
  profileCardLayout,
  truncateText,
} from '@/lib/profile/profile-card-layout';
import { getProfileWithLinks } from '@/lib/services/profile';

export const runtime = 'edge';

export const alt = 'Jovie artist profile';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export function formatReleaseCount(count: number): string {
  if (count <= 0) return 'No releases yet';
  if (count === 1) return '1 release';
  return `${count} releases`;
}

/** @deprecated Use truncateText from profile-card-layout instead */
export function truncate(input: string, maxLength: number): string {
  return truncateText(input, maxLength);
}

/**
 * Returns a generic branded fallback OG image when data fetching fails
 * or the profile is not found.
 */
function fallbackImage(username: string) {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 24,
        background:
          'radial-gradient(circle at 15% 10%, #363062 0%, #17122d 40%, #0a0715 100%)',
        color: '#ffffff',
        fontFamily: 'Inter',
      }}
    >
      <div
        style={{
          display: 'flex',
          fontSize: 48,
          fontWeight: 700,
          letterSpacing: -1,
          color: '#b6a8ff',
        }}
      >
        Jovie
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: 32,
          fontWeight: 500,
          color: '#d4cffb',
        }}
      >
        jov.ie/{username}
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: 22,
          color: '#9f95d9',
        }}
      >
        Artist growth, simplified
      </div>
    </div>,
    { ...size }
  );
}

function getReleaseSubtitle(
  profileIsPublic: boolean,
  releaseCount: number,
  topReleases: string[]
): string {
  if (!profileIsPublic) return 'Artist profile on Jovie';
  if (releaseCount <= 0) return 'Build your release catalog on Jovie';
  if (topReleases.length > 0) return topReleases.join(' • ');
  return 'Latest releases on Spotify, Apple Music, and more';
}

export default async function Image({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const normalizedUsername = username.toLowerCase();

  let profileResult: Awaited<ReturnType<typeof getProfileWithLinks>> | null =
    null;
  let releaseStats: Awaited<
    ReturnType<typeof getReleaseStatsByUsername>
  > | null = null;

  try {
    [profileResult, releaseStats] = await Promise.all([
      getProfileWithLinks(normalizedUsername),
      getReleaseStatsByUsername(normalizedUsername),
    ]);
  } catch {
    return fallbackImage(normalizedUsername);
  }

  if (!profileResult) {
    return fallbackImage(normalizedUsername);
  }

  const profileIsPublic = Boolean(profileResult?.isPublic);
  const artistName = profileResult?.displayName || username;
  const genreTags = profileIsPublic
    ? (profileResult?.genres?.slice(0, 3) ?? [])
    : [];

  const topReleases =
    profileIsPublic && releaseStats
      ? releaseStats.topReleaseTitles
          .slice(0, 3)
          .map(title => truncateText(title, 28))
      : [];

  const releaseCount =
    profileIsPublic && releaseStats ? releaseStats.releaseCount : 0;

  const releaseSubtitle = getReleaseSubtitle(
    profileIsPublic,
    releaseCount,
    topReleases
  );

  // OG images use the shared card layout for avatar + name + genres,
  // then overlay release stats on top (OG-specific, not in shared layout)
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
      }}
    >
      {profileCardLayout(
        {
          artistName,
          username: normalizedUsername,
          avatarUrl: profileResult?.avatarUrl ?? null,
          genreTags,
          releaseCount,
          releaseSubtitle,
          isPublic: profileIsPublic,
        },
        size
      )}
      {/* Release stats overlay — OG-specific */}
      <div
        style={{
          position: 'absolute',
          bottom: 48,
          left: 96,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 36,
            fontWeight: 650,
            letterSpacing: -0.8,
            color: '#ffffff',
          }}
        >
          {formatReleaseCount(releaseCount)}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 22,
            color: '#b8b2dc',
            maxWidth: 720,
          }}
        >
          {releaseSubtitle}
        </div>
      </div>
    </div>,
    {
      ...size,
    }
  );
}
