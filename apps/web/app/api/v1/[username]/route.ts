import { NextResponse } from 'next/server';
import { BASE_URL } from '@/constants/app';
import { getReleasesForProfileLite } from '@/lib/discography/queries';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
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
    return NextResponse.json(
      { error: 'Artist not found' },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }

  const [releases, merch, events] = await Promise.all([
    getReleasesForProfileLite(profile.id),
    getLiveMerchCardsForProfile(profile.id),
    getUpcomingTourDatesForProfile(profile.id),
  ]);

  const profileUrl = `${BASE_URL}/${profile.username}`;

  return NextResponse.json(
    {
      artist: {
        id: profile.id,
        username: profile.username,
        name: profile.displayName ?? profile.username,
        bio: profile.bio ?? null,
        location: profile.location ?? null,
        genres: profile.genres ?? [],
        avatarUrl: profile.avatarUrl ?? null,
        profileUrl,
        spotifyUrl: profile.spotifyUrl ?? null,
        appleMusicUrl: profile.appleMusicUrl ?? null,
        youtubeUrl: profile.youtubeUrl ?? null,
      },
      releases: releases.map(r => ({
        id: r.id,
        title: r.title,
        type: r.releaseType,
        releaseDate: r.releaseDate ?? null,
        artworkUrl: r.artworkUrl ?? null,
        url: `${profileUrl}/releases`,
      })),
      events: events.map(e => ({
        id: e.id,
        title: e.title ?? null,
        startDate: e.startDate,
        venue: e.venueName,
        city: e.city,
        country: e.country,
        ticketUrl: e.ticketUrl ?? null,
        ticketStatus: e.ticketStatus,
      })),
      merch: merch.map(m => ({
        id: m.id,
        title: m.title,
        description: m.description,
        productType: m.productType,
        imageUrl: m.primaryImageUrl,
        retailPriceCents: m.retailPriceCents,
        url: `${profileUrl}/merch`,
        available: true,
      })),
      _links: {
        self: `${BASE_URL}/api/v1/${profile.username}`,
        profile: profileUrl,
        llmsTxt: `${profileUrl}/llms.txt`,
        feed: `${profileUrl}/feed.xml`,
        mcp: `${BASE_URL}/api/mcp/${profile.username}`,
        openapi: `${BASE_URL}/api/v1/openapi.json`,
      },
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    }
  );
}
