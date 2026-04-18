import { eq } from 'drizzle-orm';
import { ImageResponse } from 'next/og';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { joviePlaylists } from '@/lib/db/schema/playlists';
import { buildPlaylistShareContext } from '@/lib/share/context';
import { loadShareFonts, STORY_SIZE, toDataUrl } from '@/lib/share/image-utils';
import { renderPlaylistStoryCard } from '@/lib/share/story-renderers';

export const runtime = 'nodejs';

const slugSchema = z.string().regex(/^[a-z0-9-]+$/);

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');

  if (!slug || !slugSchema.safeParse(slug).success) {
    return NextResponse.json(
      { error: 'Invalid playlist slug.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const [playlist] = await db
    .select({
      slug: joviePlaylists.slug,
      status: joviePlaylists.status,
      title: joviePlaylists.title,
      coverImageUrl: joviePlaylists.coverImageUrl,
      editorialNote: joviePlaylists.editorialNote,
      description: joviePlaylists.description,
    })
    .from(joviePlaylists)
    .where(eq(joviePlaylists.slug, slug))
    .limit(1);

  if (playlist?.status !== 'published') {
    return NextResponse.json(
      { error: 'Playlist not found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const context = buildPlaylistShareContext({
    slug: playlist.slug,
    title: playlist.title,
    coverImageUrl: playlist.coverImageUrl,
    editorialNote: playlist.editorialNote ?? playlist.description,
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

  const artworkDataUrl = context.imageUrl
    ? await toDataUrl(context.imageUrl)
    : null;

  return new ImageResponse(
    renderPlaylistStoryCard({
      title: context.title,
      note: context.description,
      artworkDataUrl,
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
