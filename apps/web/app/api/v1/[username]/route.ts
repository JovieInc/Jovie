import { and, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { BASE_URL } from '@/constants/app';
import {
  PUBLIC_ARTIST_API_COMMON_HEADERS,
  PUBLIC_ARTIST_API_PROFILE_CACHE_CONTROL,
  PUBLIC_ARTIST_API_RATE_LIMIT_POLICY,
  PUBLIC_ARTIST_API_RATE_LIMIT_POLICY_VALUE,
  PUBLIC_ARTIST_API_RATE_LIMIT_WINDOW_SECONDS,
} from '@/lib/api/v1/contract';
import { db } from '@/lib/db';
import { artistDailySnapshots } from '@/lib/db/schema/artist-daily-snapshots';
import { creatorProfileRiders } from '@/lib/db/schema/riders';
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
import { getActiveLinksForProfile } from '@/lib/services/social-links/queries';
import { getUpcomingTourDatesForProfile } from '@/lib/tour-dates/queries';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const YOUTUBE_CHANNEL_ID = /^UC[a-zA-Z0-9_-]{22}$/;

function readYoutubeChannelId(value: unknown): string | null {
  return typeof value === 'string' && YOUTUBE_CHANNEL_ID.test(value)
    ? value
    : null;
}

function readYoutubeChannelIdFromUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (hostname !== 'youtube.com' && !hostname.endsWith('.youtube.com')) {
      return null;
    }
    const match = /^\/channel\/(UC[a-zA-Z0-9_-]{22})\/?$/.exec(url.pathname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function readAudience(
  snapshot: { rawValues: Record<string, unknown>; fetchedAt: Date } | undefined,
  spotifyFollowers: number | null
) {
  const count = snapshot?.rawValues.subscriberCount;
  if (
    snapshot?.rawValues.precision !== 'exact' ||
    typeof count !== 'number' ||
    !Number.isSafeInteger(count) ||
    count < 0
  ) {
    if (
      !Number.isSafeInteger(spotifyFollowers) ||
      spotifyFollowers === null ||
      spotifyFollowers < 0
    ) {
      return null;
    }

    return {
      platform: 'spotify' as const,
      count: spotifyFollowers,
      countText: spotifyFollowers.toLocaleString('en-US'),
      observedAt: null,
    };
  }

  return {
    platform: 'youtube' as const,
    count,
    countText: count.toLocaleString('en-US'),
    observedAt: snapshot.fetchedAt.toISOString(),
  };
}

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
          'RateLimit-Policy': PUBLIC_ARTIST_API_RATE_LIMIT_POLICY_VALUE,
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

  if (!profile?.isPublic) {
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
  const profileExclusion = getPublicProfileDiscoveryExclusionResponse({
    handle: profile.username,
    displayName: profile.displayName,
    isPublic: profile.isPublic,
  });
  if (profileExclusion) {
    return addPublicApiHeaders(profileExclusion, rateLimitHeaders);
  }

  const [releases, merch, events, riderVisibility, links, youtubeSnapshot] =
    await Promise.all([
      getReleasesForProfileLite(profile.id),
      getLiveMerchCardsForProfile(profile.id),
      getUpcomingTourDatesForProfile(profile.id),
      db
        .select({ visibility: creatorProfileRiders.visibility })
        .from(creatorProfileRiders)
        .where(eq(creatorProfileRiders.creatorProfileId, profile.id))
        .limit(1)
        .then(rows => rows[0]?.visibility ?? null),
      getActiveLinksForProfile(profile.id),
      db
        .select({
          rawValues: artistDailySnapshots.rawValues,
          fetchedAt: artistDailySnapshots.fetchedAt,
        })
        .from(artistDailySnapshots)
        .where(
          and(
            eq(artistDailySnapshots.creatorProfileId, profile.id),
            eq(artistDailySnapshots.source, 'youtube')
          )
        )
        .orderBy(desc(artistDailySnapshots.fetchedAt))
        .limit(1)
        .then(rows => rows[0]),
    ]);

  const profileUrl = `${BASE_URL}/${profile.username}`;
  const youtubeChannelId =
    readYoutubeChannelId(youtubeSnapshot?.rawValues.channelId) ??
    readYoutubeChannelId(profile.youtubeMusicId) ??
    readYoutubeChannelIdFromUrl(profile.youtubeUrl);

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
        creatorType: profile.creatorType,
        audience: readAudience(youtubeSnapshot, profile.spotifyFollowers),
        links: links.map(link => ({
          platform: link.platform,
          url: link.url,
          displayText: link.displayText,
        })),
        platformIds: {
          spotify: profile.spotifyId ?? null,
          appleMusic: profile.appleMusicId ?? null,
          youtube: youtubeChannelId,
          deezer: profile.deezerId ?? null,
          tidal: profile.tidalId ?? null,
          soundcloud: profile.soundcloudId ?? null,
          musicbrainz: profile.musicbrainzId ?? null,
        },
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
        // Advertised only when world-readable; private/link_only stay hidden.
        ...(riderVisibility === 'profile_public'
          ? { rider: `${BASE_URL}/api/rider/${profile.username}` }
          : {}),
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
