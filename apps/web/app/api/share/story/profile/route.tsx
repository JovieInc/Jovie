import { ImageResponse } from 'next/og';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getProfileByUsername } from '@/lib/services/profile';
import { buildProfileShareContext } from '@/lib/share/context';
import { loadShareFonts, STORY_SIZE, toDataUrl } from '@/lib/share/image-utils';
import { renderProfileStoryCard } from '@/lib/share/story-renderers';

export const runtime = 'nodejs';

const usernameSchema = z.string().regex(/^[a-z0-9-]+$/);

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get('username');

  if (!username || !usernameSchema.safeParse(username).success) {
    return NextResponse.json(
      { error: 'Invalid username.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const profile = await getProfileByUsername(username);
  if (!profile?.isPublic) {
    return NextResponse.json(
      { error: 'Profile not found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const context = buildProfileShareContext({
    username: profile.usernameNormalized ?? username,
    artistName: profile.displayName ?? profile.username,
    avatarUrl: profile.avatarUrl,
    bio: profile.bio,
  });

  let fonts: Awaited<ReturnType<typeof loadShareFonts>>;
  try {
    fonts = await loadShareFonts();
  } catch {
    return NextResponse.json(
      { error: 'Font loading failed' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const avatarDataUrl = context.imageUrl
    ? await toDataUrl(context.imageUrl)
    : null;

  return new ImageResponse(
    renderProfileStoryCard({
      artistName: context.title,
      avatarDataUrl,
      bio: context.description,
      urlText: context.displayUrl,
    }),
    {
      ...STORY_SIZE,
      fonts: [
        {
          name: 'Satoshi',
          data: fonts.satoshi,
          weight: 700,
          style: 'normal' as const,
        },
        {
          name: 'Source Serif 4',
          data: fonts.sourceSerif,
          weight: 600,
          style: 'normal' as const,
        },
      ],
      headers: {
        'Cache-Control': 'public, max-age=86400',
      },
    }
  );
}
