import { NextResponse } from 'next/server';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { getReleasesForProfileLite } from '@/lib/discography/queries';
import { getProfileByUsername } from '@/lib/services/profile';

export const revalidate = 3600;

function escapeXml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const profile = await getProfileByUsername(username);

  if (!profile || !profile.isPublic) {
    return new NextResponse('Not found', { status: 404 });
  }

  const releases = await getReleasesForProfileLite(profile.id);
  const profileUrl = `${BASE_URL}/${profile.username}`;
  const artistName = escapeXml(profile.displayName ?? profile.username);

  const items = releases
    .slice(0, 30)
    .map(r => {
      const pubDate = r.releaseDate
        ? new Date(r.releaseDate).toUTCString()
        : new Date().toUTCString();
      const releaseType = r.releaseType ?? 'release';
      const imageTag = r.artworkUrl
        ? `<media:content url="${escapeXml(r.artworkUrl)}" medium="image"/>`
        : '';
      return `
  <item>
    <title>${escapeXml(r.title)} (${escapeXml(releaseType)})</title>
    <link>${escapeXml(profileUrl)}/releases</link>
    <guid isPermaLink="false">${escapeXml(BASE_URL)}/releases/${escapeXml(r.id)}</guid>
    <pubDate>${pubDate}</pubDate>
    ${imageTag}
  </item>`;
    })
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>${artistName} — Releases</title>
    <link>${escapeXml(profileUrl)}</link>
    <description>New releases by ${artistName} on ${APP_NAME}</description>
    <atom:link href="${escapeXml(profileUrl)}/feed.xml" rel="self" type="application/rss+xml"/>
    <language>en</language>
    ${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
