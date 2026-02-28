import { eq } from 'drizzle-orm';
import { ImageResponse } from 'next/og';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withDbSessionTx } from '@/lib/auth/session';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';

const querySchema = z.object({
  type: z.enum(['fan', 'claim']),
  size: z.enum(['feed', 'story']),
});

const SIZES = {
  feed: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
} as const;

const BRAND = {
  bg: 'radial-gradient(circle at 15% 10%, #363062 0%, #17122d 40%, #0a0715 100%)',
  accent: '#b6a8ff',
  secondary: '#d4cffb',
  muted: '#9f95d9',
  white: '#ffffff',
  pillBg: 'rgba(182, 168, 255, 0.22)',
  pillBorder: 'rgba(182, 168, 255, 0.4)',
} as const;

/**
 * Fan retargeting ad: "Never miss a release from [Artist]"
 */
function FanAdCreative({
  artistName,
  username,
  avatarUrl,
  size,
}: {
  artistName: string;
  username: string;
  avatarUrl: string | null;
  size: 'feed' | 'story';
}) {
  const isStory = size === 'story';
  const photoSize = isStory ? 360 : 320;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: BRAND.bg,
        color: BRAND.white,
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        padding: isStory ? '120px 80px' : '80px',
        gap: isStory ? 56 : 40,
        position: 'relative',
      }}
    >
      {/* Jovie wordmark - top right */}
      <div
        style={{
          position: 'absolute',
          top: isStory ? 60 : 40,
          right: isStory ? 60 : 40,
          display: 'flex',
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: -0.5,
          color: BRAND.accent,
        }}
      >
        Jovie
      </div>

      {/* Profile photo */}
      <div
        style={{
          width: photoSize,
          height: photoSize,
          borderRadius: photoSize / 2,
          border: '4px solid rgba(255,255,255,0.15)',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}
      >
        {avatarUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element -- ImageResponse requires standard img */
          <img
            src={avatarUrl}
            alt=''
            width={photoSize}
            height={photoSize}
            style={{ objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              fontSize: photoSize / 2.5,
              fontWeight: 700,
              color: BRAND.secondary,
              display: 'flex',
            }}
          >
            {artistName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Text block */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: isStory ? 20 : 14,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: isStory ? 28 : 24,
            fontWeight: 400,
            color: BRAND.secondary,
            letterSpacing: -0.3,
          }}
        >
          Never miss a release from
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: isStory ? 56 : 48,
            fontWeight: 700,
            letterSpacing: -1.5,
            lineHeight: 1.1,
            maxWidth: 900,
          }}
        >
          {artistName}
        </div>
      </div>

      {/* CTA pill */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px 40px',
          borderRadius: 999,
          fontSize: 22,
          fontWeight: 600,
          color: BRAND.white,
          background: BRAND.pillBg,
          border: `1.5px solid ${BRAND.pillBorder}`,
          letterSpacing: -0.2,
        }}
      >
        Turn on notifications
      </div>

      {/* URL footer */}
      <div
        style={{
          position: 'absolute',
          bottom: isStory ? 80 : 48,
          display: 'flex',
          fontSize: 22,
          fontWeight: 500,
          color: BRAND.muted,
          letterSpacing: -0.2,
        }}
      >
        jov.ie/{username}
      </div>
    </div>
  );
}

/**
 * Claim ad: "Don't lose your handle"
 */
function ClaimAdCreative({
  artistName,
  username,
  avatarUrl,
  size,
}: {
  artistName: string;
  username: string;
  avatarUrl: string | null;
  size: 'feed' | 'story';
}) {
  const isStory = size === 'story';
  const photoSize = isStory ? 320 : 280;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: BRAND.bg,
        color: BRAND.white,
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        padding: isStory ? '120px 80px' : '80px',
        gap: isStory ? 48 : 36,
        position: 'relative',
      }}
    >
      {/* Jovie wordmark - top right */}
      <div
        style={{
          position: 'absolute',
          top: isStory ? 60 : 40,
          right: isStory ? 60 : 40,
          display: 'flex',
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: -0.5,
          color: BRAND.accent,
        }}
      >
        Jovie
      </div>

      {/* Profile photo */}
      <div
        style={{
          width: photoSize,
          height: photoSize,
          borderRadius: photoSize / 2,
          border: '4px solid rgba(255,255,255,0.15)',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}
      >
        {avatarUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element -- ImageResponse requires standard img */
          <img
            src={avatarUrl}
            alt=''
            width={photoSize}
            height={photoSize}
            style={{ objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              fontSize: photoSize / 2.5,
              fontWeight: 700,
              color: BRAND.secondary,
              display: 'flex',
            }}
          >
            {artistName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Headline */}
      <div
        style={{
          display: 'flex',
          fontSize: isStory ? 52 : 44,
          fontWeight: 700,
          letterSpacing: -1.5,
          lineHeight: 1.1,
          textAlign: 'center',
        }}
      >
        Don&apos;t lose your handle
      </div>

      {/* Handle URL - prominent */}
      <div
        style={{
          display: 'flex',
          fontSize: isStory ? 36 : 32,
          fontWeight: 600,
          color: BRAND.accent,
          letterSpacing: -0.5,
        }}
      >
        jov.ie/{username}
      </div>

      {/* CTA pill */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px 40px',
          borderRadius: 999,
          fontSize: 22,
          fontWeight: 600,
          color: BRAND.white,
          background: BRAND.pillBg,
          border: `1.5px solid ${BRAND.pillBorder}`,
          letterSpacing: -0.2,
        }}
      >
        Claim your profile
      </div>
    </div>
  );
}

export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse({
    type: req.nextUrl.searchParams.get('type'),
    size: req.nextUrl.searchParams.get('size'),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid parameters. Use ?type=fan|claim&size=feed|story' },
      { status: 400 }
    );
  }

  const { type, size } = parsed.data;
  const dimensions = SIZES[size];

  try {
    return await withDbSessionTx(async (tx, clerkUserId) => {
      const [profile] = await tx
        .select({
          username: creatorProfiles.username,
          displayName: creatorProfiles.displayName,
          avatarUrl: creatorProfiles.avatarUrl,
        })
        .from(creatorProfiles)
        .innerJoin(users, eq(users.id, creatorProfiles.userId))
        .where(eq(users.clerkId, clerkUserId))
        .limit(1);

      if (!profile) {
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404 }
        );
      }

      const artistName = profile.displayName || profile.username || 'Artist';
      const username = profile.username || '';
      const avatarUrl = profile.avatarUrl || null;

      const element =
        type === 'fan' ? (
          <FanAdCreative
            artistName={artistName}
            username={username}
            avatarUrl={avatarUrl}
            size={size}
          />
        ) : (
          <ClaimAdCreative
            artistName={artistName}
            username={username}
            avatarUrl={avatarUrl}
            size={size}
          />
        );

      const filename = `jovie-ad-${type}-${size}.png`;

      return new ImageResponse(element, {
        ...dimensions,
        headers: {
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'private, max-age=60',
        },
      });
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to generate ad creative' },
      { status: 500 }
    );
  }
}
