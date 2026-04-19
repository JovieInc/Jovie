import { ImageResponse } from 'next/og';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getContentBySlug,
  getCreatorByUsername,
} from '@/app/[username]/[slug]/_lib/data';
import { buildDisplayUrl } from '@/lib/share/copy';
import { loadShareFonts, STORY_SIZE, toDataUrl } from '@/lib/share/image-utils';
import { renderReleaseStoryCard } from '@/lib/share/story-renderers';

export const runtime = 'nodejs';

const lookupQuerySchema = z.object({
  username: z.string().regex(/^[a-z0-9-]+$/),
  slug: z.string().regex(/^[a-z0-9-]+$/),
});

const directQuerySchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().trim().min(1).max(160),
  artistName: z.string().trim().min(1).max(160),
  pathname: z.string().startsWith('/'),
  artworkUrl: z.string().url().optional(),
});

export async function GET(req: NextRequest) {
  const rawParams = {
    username: req.nextUrl.searchParams.get('username'),
    slug: req.nextUrl.searchParams.get('slug'),
    title: req.nextUrl.searchParams.get('title'),
    artistName: req.nextUrl.searchParams.get('artistName'),
    pathname: req.nextUrl.searchParams.get('pathname'),
    artworkUrl: req.nextUrl.searchParams.get('artworkUrl') ?? undefined,
  };
  const lookupParams = lookupQuerySchema.safeParse(rawParams);
  const directParams = directQuerySchema.safeParse(rawParams);

  let title: string;
  let artistName: string;
  let imageUrl: string | null;
  let displayUrl: string;

  if (lookupParams.success) {
    const creator = await getCreatorByUsername(lookupParams.data.username);
    if (!creator) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const content = await getContentBySlug(creator.id, lookupParams.data.slug);
    if (!content) {
      return NextResponse.json(
        { error: 'Release not found' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    title = content.title;
    artistName =
      creator.displayName ?? creator.username ?? lookupParams.data.username;
    imageUrl = content.artworkUrl;
    displayUrl = buildDisplayUrl(
      `/${creator.usernameNormalized ?? lookupParams.data.username}/${content.slug}`
    );
  } else if (directParams.success) {
    title = directParams.data.title;
    artistName = directParams.data.artistName;
    imageUrl = directParams.data.artworkUrl ?? null;
    displayUrl = buildDisplayUrl(directParams.data.pathname);
  } else {
    return NextResponse.json(
      { error: 'Invalid release parameters.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  let fonts: Awaited<ReturnType<typeof loadShareFonts>>;
  try {
    fonts = await loadShareFonts();
  } catch {
    return NextResponse.json(
      { error: 'Font loading failed' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const artworkDataUrl = imageUrl ? await toDataUrl(imageUrl) : null;

  return new ImageResponse(
    renderReleaseStoryCard({
      title,
      artistName,
      artworkDataUrl,
      urlText: displayUrl,
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
