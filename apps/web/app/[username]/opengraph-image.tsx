import { ImageResponse } from 'next/og';
import { BASE_URL } from '@/constants/app';
import { getProfileWithLinks } from '@/lib/services/profile';

export const runtime = 'edge';
export const revalidate = 900; // 15 min — matches previous Cache-Control max-age

export const alt = 'Jovie artist profile';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

function truncateName(name: string): string {
  return name.length > 44 ? `${name.slice(0, 43)}…` : name;
}

async function toDataUrl(imageUrl: string): Promise<string | null> {
  try {
    const response = await fetch(imageUrl, {
      headers: { Accept: 'image/*' },
      cache: 'force-cache',
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) return null;

    // Limit to 2MB to avoid memory pressure in edge runtime
    const contentLength = response.headers.get('content-length');
    if (contentLength && Number.parseInt(contentLength, 10) > 2 * 1024 * 1024) {
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > 2 * 1024 * 1024) return null;
    const bytes = new Uint8Array(arrayBuffer);
    // Convert to binary string in chunks to avoid call stack limits
    // and O(n²) string concatenation in edge runtime
    const CHUNK = 8192;
    const chunks: string[] = [];
    for (let i = 0; i < bytes.length; i += CHUNK) {
      chunks.push(String.fromCodePoint(...bytes.subarray(i, i + CHUNK)));
    }
    return `data:${contentType};base64,${btoa(chunks.join(''))}`;
  } catch {
    return null;
  }
}

function gradientCard(headline: string, subtitle: string) {
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
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori requires standard img */}
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
          {headline}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 30,
            color: 'rgba(255,255,255,0.82)',
          }}
        >
          {subtitle}
        </div>
      </div>
    </div>,
    { ...size }
  );
}

function heroImage(
  name: string,
  photoDataUrl: string,
  genres: string[],
  username: string
) {
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
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori requires standard img */}
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

      {/* Dark gradient overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          background:
            'linear-gradient(100deg, rgba(10,8,20,0.86) 0%, rgba(10,8,20,0.58) 48%, rgba(10,8,20,0.24) 100%)',
        }}
      />

      {/* Jovie logo */}
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori requires standard img */}
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

      {/* Artist name + genre tags */}
      <div
        style={{
          position: 'absolute',
          left: 54,
          bottom: 50,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
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
        {genres.length > 0 ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {genres.map(genre => (
              <div
                key={genre}
                style={{
                  display: 'flex',
                  padding: '6px 16px',
                  borderRadius: 999,
                  fontSize: 22,
                  fontWeight: 500,
                  color: 'rgba(255,255,255,0.9)',
                  background: 'rgba(255,255,255,0.15)',
                  border: '1px solid rgba(255,255,255,0.25)',
                }}
              >
                {genre}
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              fontSize: 28,
              color: 'rgba(255,255,255,0.84)',
            }}
          >
            jov.ie/{username}
          </div>
        )}
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

  try {
    // 3-second timeout ensures the fallback image renders reliably
    // even if the DB is slow (edge runtime has a 25s budget, but we want fast OG)
    profileResult = await Promise.race([
      getProfileWithLinks(normalizedUsername),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('OG image data fetch timeout')), 3000)
      ),
    ]);
  } catch {
    return gradientCard(
      `jov.ie/${normalizedUsername}`,
      'Artist growth, simplified'
    );
  }

  if (!profileResult?.isPublic) {
    return gradientCard(
      `jov.ie/${normalizedUsername}`,
      'Artist growth, simplified'
    );
  }

  const artistName = profileResult.displayName || username;
  const genres = profileResult.genres?.slice(0, 3) ?? [];

  if (!profileResult.avatarUrl) {
    return gradientCard(truncateName(artistName), 'Artist profile on Jovie');
  }

  const photoDataUrl = await toDataUrl(profileResult.avatarUrl);

  if (!photoDataUrl) {
    return gradientCard(truncateName(artistName), 'Artist profile on Jovie');
  }

  return heroImage(artistName, photoDataUrl, genres, normalizedUsername);
}
