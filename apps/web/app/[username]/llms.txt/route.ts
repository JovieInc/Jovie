import { NextResponse } from 'next/server';
import { BASE_URL } from '@/constants/app';
import { getReleasesForProfileLite } from '@/lib/discography/queries';
import { getLiveMerchCardsForProfile } from '@/lib/merch/service';
import { getProfileByUsername } from '@/lib/services/profile';
import { getUpcomingTourDatesForProfile } from '@/lib/tour-dates/queries';

export const revalidate = 3600;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const profile = await getProfileByUsername(username);

  if (!profile || !profile.isPublic) {
    return new NextResponse('Not found', { status: 404 });
  }

  const [releases, merch, tour] = await Promise.all([
    getReleasesForProfileLite(profile.id),
    getLiveMerchCardsForProfile(profile.id),
    getUpcomingTourDatesForProfile(profile.id),
  ]);

  const profileUrl = `${BASE_URL}/${profile.username}`;
  const artistName = profile.displayName ?? profile.username;

  const releaseLines = releases
    .slice(0, 10)
    .map(r => {
      const date = r.releaseDate ? ` (${r.releaseDate})` : '';
      return `- [${r.title}${date}](${profileUrl}/releases)`;
    })
    .join('\n');

  const merchLines = merch
    .slice(0, 6)
    .map(m => {
      const price = (m.retailPriceCents / 100).toFixed(2);
      return `- [${m.title} — $${price}](${profileUrl}/merch)`;
    })
    .join('\n');

  const tourLines = tour
    .slice(0, 10)
    .map(t => {
      const venue = t.venueName ? `${t.venueName}, ` : '';
      const ticketText = t.ticketUrl ? ` [Tickets](${t.ticketUrl})` : '';
      return `- ${t.startDate} — ${venue}${t.city}, ${t.country}${ticketText}`;
    })
    .join('\n');

  const socialLine = profile.spotifyUrl
    ? `\n- [Spotify](${profile.spotifyUrl})`
    : '';

  const content = `# ${artistName}

> ${profile.bio ?? `${artistName} on Jovie — smart links, releases, and merch.`}

## Artist Info

- **Profile**: ${profileUrl}
- **Username**: ${profile.username}
${profile.location ? `- **Location**: ${profile.location}` : ''}
${profile.genres?.length ? `- **Genres**: ${profile.genres.join(', ')}` : ''}${socialLine}

## Releases
${releaseLines || '- No releases yet.'}

[All releases](${profileUrl}/releases)
${
  merch.length > 0
    ? `
## Merch
${merchLines}

[Shop](${profileUrl}/merch)`
    : ''
}
${
  tour.length > 0
    ? `
## Tour Dates
${tourLines}

[All tour dates](${profileUrl}/tour)`
    : ''
}

## Links

- [Artist profile](${profileUrl})
- [Music & streaming](${profileUrl}/music)
- [JSON feed](${BASE_URL}/api/v1/${profile.username})
- [RSS feed](${profileUrl}/feed.xml)
- [MCP server](${BASE_URL}/api/mcp/${profile.username})
`;

  return new Response(content.trim() + '\n', {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
