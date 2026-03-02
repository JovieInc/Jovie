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

/** Color themes for ad creatives — Apple-inspired */
const THEME = {
  dark: {
    bg: '#000000',
    text: '#F5F5F7',
    textSecondary: '#A1A1A6',
    textMuted: '#6E6E73',
    border: '#1D1D1F',
    buttonBg: '#FFFFFF',
    buttonText: '#000000',
  },
  light: {
    bg: '#FBFBFD',
    text: '#1D1D1F',
    textSecondary: '#6E6E73',
    textMuted: '#86868B',
    border: '#D2D2D7',
    buttonBg: '#1D1D1F',
    buttonText: '#FFFFFF',
  },
} as const;

const FONT_STACK =
  '"SF Pro Display", "Inter Variable", -apple-system, BlinkMacSystemFont, system-ui, sans-serif';

/** Shared ad creative props */
interface AdCreativeProps {
  readonly artistName: string;
  readonly username: string;
  readonly avatarUrl: string | null;
  readonly size: 'feed' | 'story';
}

/**
 * Shared layout shell for retargeting ad creatives.
 * Apple-inspired: generous whitespace, tight tracking, bold type hierarchy.
 * Renders branding, optional profile photo, text content, and CTA button.
 */
function AdCreativeLayout({
  size,
  photoSize,
  artistName,
  avatarUrl,
  showPhoto = true,
  theme,
  textContent,
  ctaLabel,
  footer,
}: {
  size: 'feed' | 'story';
  photoSize: number;
  artistName: string;
  avatarUrl: string | null;
  showPhoto?: boolean;
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
        padding: isStory ? '120px 100px' : '80px',
        position: 'relative',
      }}
    >
      {/* Subtle Jovie branding — top left */}
      <div
        style={{
          position: 'absolute',
          top: isStory ? 80 : 60,
          display: 'flex',
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: '-0.03em',
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
          gap: isStory ? 72 : 56,
          marginTop: isStory ? -40 : 0,
        }}
      >
        {/* Profile photo — only when showPhoto is true */}
        {showPhoto && (
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
        )}

        {/* Text block */}
        {textContent}

        {/* CTA pill — Apple-style rounded rect */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '22px 52px',
            borderRadius: 980,
            fontSize: 26,
            fontWeight: 600,
            color: theme.buttonText,
            background: theme.buttonBg,
            letterSpacing: '-0.02em',
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
      photoSize={isStory ? 400 : 340}
      artistName={artistName}
      avatarUrl={avatarUrl}
      showPhoto
      theme={theme}
      ctaLabel='Turn on notifications'
      textContent={
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: isStory ? 32 : 28,
              fontWeight: 400,
              color: theme.textSecondary,
              letterSpacing: '-0.02em',
            }}
          >
            Never miss a release from
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: isStory ? 76 : 64,
              fontWeight: 700,
              letterSpacing: '-0.045em',
              lineHeight: 1,
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
            fontSize: 24,
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
function ClaimAdCreative({ artistName, username, size }: AdCreativeProps) {
  const isStory = size === 'story';
  const theme = THEME.light;

  return (
    <AdCreativeLayout
      size={size}
      photoSize={0}
      artistName={artistName}
      avatarUrl={null}
      showPhoto={false}
      theme={theme}
      ctaLabel='Claim your profile'
      textContent={
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 28,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: isStory ? 80 : 68,
              fontWeight: 700,
              letterSpacing: '-0.045em',
              lineHeight: 1,
              color: theme.text,
              maxWidth: 880,
            }}
          >
            Don&apos;t lose your handle.
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: isStory ? 38 : 34,
              fontWeight: 500,
              color: theme.textSecondary,
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

      // Sanitize avatar URL — only allow https/http and relative paths.
      // Rejects javascript:, data:, and other dangerous URI schemes (CodeQL XSS fix).
      let avatarUrl: string | null = profile.avatarUrl || null;
      if (avatarUrl) {
        if (
          avatarUrl.startsWith('https://') ||
          avatarUrl.startsWith('http://')
        ) {
          // Already absolute and safe — Satori requires absolute URLs for <img>
        } else if (avatarUrl.startsWith('/')) {
          avatarUrl = `${req.nextUrl.origin}${avatarUrl}`;
        } else {
          // Reject non-http(s), non-relative URLs
          avatarUrl = null;
        }
      }

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
