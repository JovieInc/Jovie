import { NextResponse } from 'next/server';
import { BASE_URL } from '@/constants/app';
import {
  PUBLIC_ARTIST_API_COMMON_HEADERS,
  PUBLIC_ARTIST_API_PROFILE_CACHE_CONTROL,
  PUBLIC_ARTIST_API_RATE_LIMIT_POLICY,
  PUBLIC_ARTIST_API_RATE_LIMIT_WINDOW_SECONDS,
} from '@/lib/api/v1/contract';
import { getReleasesForProfileLite } from '@/lib/discography/queries';
import { NO_STORE_HEADERS, RETRY_AFTER_SERVICE } from '@/lib/http/headers';
import { getLiveMerchCardsForProfile } from '@/lib/merch/service';
import { getPublicProfileDiscoveryExclusionResponse } from '@/lib/profile/public-profile-discovery-response';
import {
  createRateLimitHeaders,
  getClientIP,
  publicArtistApiLimiter,
} from '@/lib/rate-limit';
import { getProfileByUsername } from '@/lib/services/profile';
import { getUpcomingTourDatesForProfile } from '@/lib/tour-dates/queries';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getPublicProfileRateLimitHeaders(
  result: Parameters<typeof createRateLimitHeaders>[0]
): Record<string, string> {
  return createRateLimitHeaders(result, {
    policyName: PUBLIC_ARTIST_API_RATE_LIMIT_POLICY,
    windowSeconds: PUBLIC_ARTIST_API_RATE_LIMIT_WINDOW_SECONDS,
  });
}

function addPublicApiHeaders(
  response: NextResponse,
  headers: Record<string, string>
): NextResponse {
  for (const [name, value] of Object.entries({
    ...PUBLIC_ARTIST_API_COMMON_HEADERS,
    ...headers,
  })) {
    response.headers.set(name, value);
  }
  return response;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const rateLimit = await publicArtistApiLimiter.limit(getClientIP(request));
  if (!rateLimit.success && rateLimit.unavailable) {
    return NextResponse.json(
      {
        error: 'Public API temporarily unavailable',
        code: 'RATE_LIMIT_UNAVAILABLE',
      },
      {
        status: 503,
        headers: {
          ...NO_STORE_HEADERS,
          ...PUBLIC_ARTIST_API_COMMON_HEADERS,
          'Retry-After': RETRY_AFTER_SERVICE,
        },
      }
    );
  }

  const rateLimitHeaders = getPublicProfileRateLimitHeaders(rateLimit);
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: 'Too many requests', code: 'RATE_LIMITED' },
      {
        status: 429,
        headers: {
          ...NO_STORE_HEADERS,
          ...PUBLIC_ARTIST_API_COMMON_HEADERS,
          ...rateLimitHeaders,
        },
      }
    );
  }

  const { username } = await params;
  const requestExclusion = getPublicProfileDiscoveryExclusionResponse(username);
  if (requestExclusion) {
    return addPublicApiHeaders(requestExclusion, rateLimitHeaders);
  }

  const profile = await getProfileByUsername(username);

  if (!profile || !profile.isPublic) {
    return NextResponse.json(
      { error: 'Artist not found' },
      {
        status: 404,
        headers: {
          ...NO_STORE_HEADERS,
          ...PUBLIC_ARTIST_API_COMMON_HEADERS,
          ...rateLimitHeaders,
        },
      }
    );
  }
  const profileExclusion = getPublicProfileDiscoveryExclusionResponse(
    profile.username
  );
  if (profileExclusion) {
    return addPublicApiHeaders(profileExclusion, rateLimitHeaders);
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
        ...PUBLIC_ARTIST_API_COMMON_HEADERS,
        ...rateLimitHeaders,
        'Cache-Control': PUBLIC_ARTIST_API_PROFILE_CACHE_CONTROL,
      },
    }
  );
}
