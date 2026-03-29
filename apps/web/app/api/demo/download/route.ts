import { NextResponse } from 'next/server';

/**
 * Proxies the demo video download to handle cross-origin Content-Disposition.
 * Vercel Blob URLs may not honor the `download` attribute on `<a>` tags.
 */
export async function GET() {
  const videoUrl = process.env.DEMO_VIDEO_URL;

  if (!videoUrl) {
    return NextResponse.json(
      { error: 'Demo video not configured' },
      { status: 404 }
    );
  }

  const response = await fetch(videoUrl);

  if (!response.ok) {
    return NextResponse.json(
      { error: 'Failed to fetch demo video' },
      { status: 502 }
    );
  }

  return new NextResponse(response.body, {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Disposition': 'attachment; filename="jovie-demo.mp4"',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
