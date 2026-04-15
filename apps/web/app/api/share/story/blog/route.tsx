import { ImageResponse } from 'next/og';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getBlogPost } from '@/lib/blog/getBlogPosts';
import { buildBlogShareContext } from '@/lib/share/context';
import { loadShareFonts, STORY_SIZE } from '@/lib/share/image-utils';
import { renderBlogStoryCard } from '@/lib/share/story-renderers';

export const runtime = 'nodejs';

const slugSchema = z.string().regex(/^[a-z0-9-]+$/);

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');

  if (!slug || !slugSchema.safeParse(slug).success) {
    return NextResponse.json(
      {
        error:
          'Invalid slug. Use lowercase alphanumeric characters and hyphens.',
      },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  let context: ReturnType<typeof buildBlogShareContext>;

  try {
    const post = await getBlogPost(slug);
    context = buildBlogShareContext({
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
    });
  } catch (error: unknown) {
    const isNotFound =
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT';
    const status = isNotFound ? 404 : 500;
    return NextResponse.json(
      { error: isNotFound ? 'Blog post not found' : 'Internal error' },
      { status, headers: { 'Cache-Control': 'no-store' } }
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

  return new ImageResponse(
    renderBlogStoryCard({
      title: context.title,
      excerpt: context.description,
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
