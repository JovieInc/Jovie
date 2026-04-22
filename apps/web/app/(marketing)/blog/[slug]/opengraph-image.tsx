import { ImageResponse } from 'next/og';
import { getBlogPost } from '@/lib/blog/getBlogPosts';
import { loadSatoshiFont, OG_SIZE, THEME } from '@/lib/share/image-utils';

export const runtime = 'nodejs';
export const revalidate = false;

export const alt = 'Jovie blog post';
export const size = OG_SIZE;
export const contentType = 'image/png';

function truncateTitle(title: string, max = 120): string {
  return title.length > max ? `${title.slice(0, max - 1)}…` : title;
}

function truncateExcerpt(excerpt: string, max = 160): string {
  return excerpt.length > max ? `${excerpt.slice(0, max - 1)}…` : excerpt;
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let title = 'Jovie Blog';
  let excerpt = '';

  try {
    const post = await getBlogPost(slug);
    title = post.title;
    excerpt = post.excerpt;
  } catch {
    // Fallback to generic card if post not found
  }

  let satoshiFont: ArrayBuffer;
  try {
    satoshiFont = await loadSatoshiFont();
  } catch {
    // If font fails, render with system fonts rather than failing entirely.
    // OG images are best-effort; a system-font image is better than a broken link preview.
    return new ImageResponse(
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          background: THEME.bg,
          color: THEME.text,
          fontFamily: 'Inter, sans-serif',
          padding: 80,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 56,
            fontWeight: 700,
            lineHeight: 1.15,
          }}
        >
          {truncateTitle(title)}
        </div>
        {excerpt && (
          <div
            style={{
              display: 'flex',
              fontSize: 24,
              color: THEME.textMuted,
              marginTop: 24,
            }}
          >
            {truncateExcerpt(excerpt)}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            fontSize: 20,
            color: THEME.textMuted,
            marginTop: 40,
          }}
        >
          jov.ie/blog
        </div>
      </div>,
      { ...size }
    );
  }

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        background: THEME.bg,
        color: THEME.text,
        fontFamily: 'Satoshi, sans-serif',
        padding: 80,
      }}
    >
      <div
        style={{
          display: 'flex',
          fontSize: 56,
          fontWeight: 700,
          lineHeight: 1.15,
          letterSpacing: '-0.03em',
          maxWidth: 1000,
        }}
      >
        {truncateTitle(title)}
      </div>
      {excerpt && (
        <div
          style={{
            display: 'flex',
            fontSize: 24,
            fontWeight: 400,
            color: THEME.textMuted,
            marginTop: 24,
            lineHeight: 1.4,
            maxWidth: 900,
          }}
        >
          {truncateExcerpt(excerpt)}
        </div>
      )}
      <div
        style={{
          display: 'flex',
          fontSize: 20,
          fontWeight: 500,
          color: THEME.textMuted,
          marginTop: 40,
          letterSpacing: '-0.02em',
        }}
      >
        jov.ie/blog
      </div>
    </div>,
    {
      ...size,
      fonts: [
        {
          name: 'Satoshi',
          data: satoshiFont,
          weight: 700,
          style: 'normal',
        },
      ],
    }
  );
}
