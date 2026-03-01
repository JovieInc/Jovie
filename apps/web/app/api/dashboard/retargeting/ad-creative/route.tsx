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

/** Color themes for ad creatives */
const THEME = {
  dark: {
    bg: '#000000',
    text: '#F5F5F7',
    textMuted: '#86868B',
    border: '#333336',
    buttonBg: '#FFFFFF',
    buttonText: '#000000',
  },
  light: {
    bg: '#FFFFFF',
    text: '#1D1D1F',
    textMuted: '#86868B',
    border: '#E5E5EA',
    buttonBg: '#000000',
    buttonText: '#FFFFFF',
  },
} as const;

const FONT_STACK =
  '"SF Pro Display", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

/** Shared ad creative props */
interface AdCreativeProps {
  readonly artistName: string;
  readonly username: string;
  readonly avatarUrl: string | null;
  readonly size: 'feed' | 'story';
}

/**
 * Shared layout shell for retargeting ad creatives.
 * Renders branding, profile photo, text content, and CTA button
 * with a consistent structure across dark/light themes.
 */
function AdCreativeLayout({
  size,
  photoSize,
  artistName,
  avatarUrl,
  theme,
  textContent,
  ctaLabel,
  footer,
}: {
  size: 'feed' | 'story';
  photoSize: number;
  artistName: string;
  avatarUrl: string | null;
  theme: (typeof THEME)['dark'] | (typeof THEME)['light'];
  textContent: React.ReactNode;
  ctaLabel: string;
  footer?: React.ReactNode;
}) {
  const isStory = size === 'story';

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: theme.bg,
        color: theme.text,
        fontFamily: FONT_STACK,
        padding: isStory ? '120px' : '80px',
        position: 'relative',
      }}
    >
      {/* Subtle Jovie branding */}
      <div
        style={{
          position: 'absolute',
          top: isStory ? 80 : 60,
          display: 'flex',
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          color: theme.textMuted,
        }}
      >
        Jovie
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: isStory ? 80 : 64,
          marginTop: isStory ? -40 : 0,
        }}
      >
        {/* Profile photo */}
        <div
          style={{
            width: photoSize,
            height: photoSize,
            borderRadius: photoSize / 2,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: theme.border,
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
                fontWeight: 600,
                color: theme.textMuted,
                display: 'flex',
              }}
            >
              {artistName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Text block */}
        {textContent}

        {/* CTA pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px 56px',
            borderRadius: 999,
            fontSize: 28,
            fontWeight: 600,
            color: theme.buttonText,
            background: theme.buttonBg,
            letterSpacing: '-0.01em',
          }}
        >
          {ctaLabel}
        </div>
      </div>

      {footer}
    </div>
  );
}

/**
 * Fan retargeting ad: "Never miss a release from [Artist]"
 */
function FanAdCreative({
  artistName,
  username,
  avatarUrl,
  size,
}: AdCreativeProps) {
  const isStory = size === 'story';
  const theme = THEME.dark;

  return (
    <AdCreativeLayout
      size={size}
      photoSize={isStory ? 440 : 380}
      artistName={artistName}
      avatarUrl={avatarUrl}
      theme={theme}
      ctaLabel='Turn on notifications'
      textContent={
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: isStory ? 36 : 32,
              fontWeight: 500,
              color: theme.textMuted,
              letterSpacing: '-0.02em',
            }}
          >
            Never miss a release from
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: isStory ? 80 : 68,
              fontWeight: 700,
              letterSpacing: '-0.04em',
              lineHeight: 1.05,
              maxWidth: 900,
              color: theme.text,
            }}
          >
            {artistName}
          </div>
        </div>
      }
      footer={
        <div
          style={{
            position: 'absolute',
            bottom: isStory ? 80 : 60,
            display: 'flex',
            fontSize: 28,
            fontWeight: 500,
            color: theme.textMuted,
            letterSpacing: '-0.02em',
          }}
        >
          jov.ie/{username}
        </div>
      }
    />
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
}: AdCreativeProps) {
  const isStory = size === 'story';
  const theme = THEME.light;

  return (
    <AdCreativeLayout
      size={size}
      photoSize={isStory ? 360 : 320}
      artistName={artistName}
      avatarUrl={avatarUrl}
      theme={theme}
      ctaLabel='Claim your profile'
      textContent={
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 24,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: isStory ? 72 : 64,
              fontWeight: 700,
              letterSpacing: '-0.04em',
              lineHeight: 1.05,
              color: theme.text,
              maxWidth: 800,
            }}
          >
            Don&apos;t lose your handle.
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: isStory ? 40 : 36,
              fontWeight: 500,
              color: theme.textMuted,
              letterSpacing: '-0.02em',
            }}
          >
            jov.ie/{username}
          </div>
        </div>
      }
    />
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
          isAdmin: users.isAdmin,
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

      if (!profile.isAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
