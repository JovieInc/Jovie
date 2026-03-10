import { eq } from 'drizzle-orm';
import { ImageResponse } from 'next/og';
import { BASE_URL } from '@/constants/app';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';

export const runtime = 'edge';

const IMAGE_SIZE = {
  width: 1200,
  height: 630,
} as const;

const CACHE_CONTROL =
  'public, max-age=900, s-maxage=86400, stale-while-revalidate=604800';

function truncateName(name: string): string {
  return name.length > 44 ? `${name.slice(0, 43)}…` : name;
}

function brandedFallback(name: string) {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        background:
          'linear-gradient(138deg, #151033 0%, #22184a 45%, #2f1f68 100%)',
        color: '#ffffff',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- next/og ImageResponse requires standard img elements */}
      <img
        src={`${BASE_URL}/Jovie-logo.png`}
        alt='Jovie'
        width={240}
        height={64}
        style={{
          position: 'absolute',
          top: 42,
          left: 54,
          objectFit: 'contain',
        }}
      />
      <div
        style={{
          marginTop: 'auto',
          marginBottom: 64,
          marginLeft: 54,
          marginRight: 54,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          maxWidth: 880,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 74,
            fontWeight: 700,
            letterSpacing: -2,
            lineHeight: 1,
          }}
        >
          {truncateName(name)}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 30,
            color: 'rgba(255,255,255,0.82)',
          }}
        >
          Artist profile on Jovie
        </div>
      </div>
    </div>,
    {
      ...IMAGE_SIZE,
      headers: {
        'Cache-Control': CACHE_CONTROL,
      },
    }
  );
}

function heroImage(name: string, photoDataUrl: string) {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        overflow: 'hidden',
        background: '#120d28',
        color: '#ffffff',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- next/og ImageResponse requires standard img elements */}
      <img
        src={photoDataUrl}
        alt={`${name} profile`}
        width={1200}
        height={630}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(100deg, rgba(10,8,20,0.86) 0%, rgba(10,8,20,0.58) 48%, rgba(10,8,20,0.24) 100%)',
        }}
      />

      {/* eslint-disable-next-line @next/next/no-img-element -- next/og ImageResponse requires standard img elements */}
      <img
        src={`${BASE_URL}/Jovie-logo.png`}
        alt='Jovie'
        width={232}
        height={62}
        style={{
          position: 'absolute',
          top: 42,
          left: 54,
          objectFit: 'contain',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: 54,
          bottom: 66,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          maxWidth: 840,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 78,
            fontWeight: 750,
            lineHeight: 1,
            letterSpacing: -2,
            textShadow: '0 12px 34px rgba(0,0,0,0.35)',
          }}
        >
          {truncateName(name)}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 30,
            color: 'rgba(255,255,255,0.84)',
          }}
        >
          Artist profile on Jovie
        </div>
      </div>
    </div>,
    {
      ...IMAGE_SIZE,
      headers: {
        'Cache-Control': CACHE_CONTROL,
      },
    }
  );
}

async function toDataUrl(imageUrl: string): Promise<string | null> {
  try {
    const response = await fetch(imageUrl, {
      headers: {
        Accept: 'image/*',
      },
      cache: 'force-cache',
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) {
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';

    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }

    return `data:${contentType};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ artistSlug: string }> }
) {
  const { artistSlug } = await params;
  const normalizedSlug = artistSlug.toLowerCase();

  const [profile] = await db
    .select({
      username: creatorProfiles.username,
      displayName: creatorProfiles.displayName,
      avatarUrl: creatorProfiles.avatarUrl,
      isPublic: creatorProfiles.isPublic,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.usernameNormalized, normalizedSlug))
    .limit(1);

  if (!profile?.isPublic) {
    return brandedFallback(normalizedSlug);
  }

  const artistName = profile.displayName || profile.username;

  if (!profile.avatarUrl) {
    return brandedFallback(artistName);
  }

  const artistPhotoData = await toDataUrl(profile.avatarUrl);

  if (!artistPhotoData) {
    return brandedFallback(artistName);
  }

  return heroImage(artistName, artistPhotoData);
}
