import { ImageResponse } from 'next/og';
import { type NextRequest, NextResponse } from 'next/server';
import { profileCardLayout } from '@/lib/profile/profile-card-layout';
import { getProfileWithLinks } from '@/lib/services/profile';

export const runtime = 'edge';

const SIZES = {
  feed: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
} as const;

type SizeKey = keyof typeof SIZES;

function fallbackCard(username: string, size: (typeof SIZES)[SizeKey]) {
  return new ImageResponse(
    profileCardLayout(
      {
        artistName: username,
        username,
        avatarUrl: null,
        genreTags: [],
        isPublic: true,
      },
      size
    ),
    {
      ...size,
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=604800',
      },
    }
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const normalizedUsername = username.toLowerCase();
  const { searchParams } = request.nextUrl;

  const sizeKey = (searchParams.get('size') || 'feed') as SizeKey;
  const size = SIZES[sizeKey] || SIZES.feed;
  const isDownload = searchParams.get('download') === '1';

  let profileResult: Awaited<ReturnType<typeof getProfileWithLinks>> | null =
    null;

  try {
    profileResult = await getProfileWithLinks(normalizedUsername);
  } catch {
    return fallbackCard(normalizedUsername, size);
  }

  if (!profileResult) {
    return fallbackCard(normalizedUsername, size);
  }

  const artistName = profileResult.displayName || username;
  const genreTags = profileResult.genres?.slice(0, 3) ?? [];

  const imageResponse = new ImageResponse(
    profileCardLayout(
      {
        artistName,
        username: normalizedUsername,
        avatarUrl: profileResult.avatarUrl ?? null,
        genreTags,
        isPublic: Boolean(profileResult.isPublic),
      },
      size
    ),
    {
      ...size,
    }
  );

  // Set cache + optional download headers
  const headers = new Headers(imageResponse.headers);
  headers.set('Cache-Control', 'public, max-age=86400, s-maxage=604800');

  if (isDownload) {
    headers.set(
      'Content-Disposition',
      `attachment; filename="jovie-${normalizedUsername}-${sizeKey}.png"`
    );
  }

  return new NextResponse(imageResponse.body, {
    status: 200,
    headers,
  });
}
