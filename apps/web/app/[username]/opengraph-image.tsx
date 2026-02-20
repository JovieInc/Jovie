import { ImageResponse } from 'next/og';
import { getReleaseStatsByUsername } from '@/lib/discography/queries';
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

export function truncate(input: string, maxLength: number): string {
  if (input.length <= maxLength) return input;
  return `${input.slice(0, maxLength - 1)}…`;
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
          .map(title => truncate(title, 28))
      : [];

  const releaseCount =
    profileIsPublic && releaseStats ? releaseStats.releaseCount : 0;

  const releaseSubtitle = !profileIsPublic
    ? 'Artist profile on Jovie'
    : releaseCount > 0
      ? topReleases.length > 0
        ? topReleases.join(' • ')
        : 'Latest releases on Spotify, Apple Music, and more'
      : 'Build your release catalog on Jovie';

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        background:
          'radial-gradient(circle at 15% 10%, #363062 0%, #17122d 40%, #0a0715 100%)',
        color: '#ffffff',
        fontFamily: 'Inter',
        padding: 48,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 30,
          right: 40,
          display: 'flex',
          fontSize: 30,
          fontWeight: 600,
          letterSpacing: -0.5,
          color: '#b6a8ff',
        }}
      >
        Jovie
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '100%',
          borderRadius: 28,
          border: '1px solid rgba(255,255,255,0.14)',
          background: 'rgba(8, 8, 18, 0.44)',
          padding: 36,
        }}
      >
        <div style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
          <div
            style={{
              width: 164,
              height: 164,
              borderRadius: 24,
              border: '2px solid rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.08)',
              overflow: 'hidden',
              display: 'flex',
            }}
          >
            {profileIsPublic && profileResult?.avatarUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element -- next/og ImageResponse requires standard img elements */
              <img
                src={profileResult.avatarUrl}
                alt={`${artistName} avatar`}
                width={164}
                height={164}
                style={{ objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 58,
                  fontWeight: 700,
                  color: '#d9d4ff',
                }}
              >
                {artistName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                display: 'flex',
                fontSize: 60,
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: -1.4,
                maxWidth: 820,
              }}
            >
              {truncate(artistName, 32)}
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: 28,
                color: '#d4cffb',
                maxWidth: 820,
              }}
            >
              {profileIsPublic
                ? `@${normalizedUsername}`
                : 'Artist profile preview'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {(genreTags.length > 0 ? genreTags : ['Artist profile']).map(
              tag => (
                <div
                  key={tag}
                  style={{
                    display: 'flex',
                    padding: '8px 14px',
                    borderRadius: 999,
                    fontSize: 20,
                    fontWeight: 500,
                    color: '#e7e1ff',
                    background: 'rgba(182, 168, 255, 0.18)',
                    border: '1px solid rgba(182, 168, 255, 0.35)',
                  }}
                >
                  {truncate(tag, 18)}
                </div>
              )
            )}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 20,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                style={{
                  display: 'flex',
                  fontSize: 36,
                  fontWeight: 650,
                  letterSpacing: -0.8,
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

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                fontSize: 20,
                color: '#c7bfff',
              }}
            >
              <span>jov.ie/{normalizedUsername}</span>
              <span style={{ color: '#9f95d9' }}>
                Artist growth, simplified
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>,
    {
      ...size,
    }
  );
}
