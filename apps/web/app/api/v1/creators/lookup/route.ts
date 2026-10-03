import { NextResponse } from 'next/server';
import { BASE_URL } from '@/constants/app';
import {
  PUBLIC_ARTIST_API_COMMON_HEADERS,
  PUBLIC_ARTIST_API_PROFILE_CACHE_CONTROL,
  PUBLIC_ARTIST_API_RATE_LIMIT_POLICY,
  PUBLIC_ARTIST_API_RATE_LIMIT_POLICY_VALUE,
  PUBLIC_ARTIST_API_RATE_LIMIT_WINDOW_SECONDS,
} from '@/lib/api/v1/contract';
import { type CreatorLookupProfile, lookupCreator } from '@/lib/creator-lookup';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS, RETRY_AFTER_SERVICE } from '@/lib/http/headers';
import {
  createRateLimitHeaders,
  getClientIP,
  publicArtistApiLimiter,
} from '@/lib/rate-limit';
import {
  YouTubeDataApiUnavailableError,
  type YouTubeResolvedChannel,
} from '@/lib/youtube/resolve-channel';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function response(
  body: Record<string, unknown>,
  status: number,
  rateLimitHeaders: Record<string, string>,
  extraHeaders: Record<string, string> = {}
) {
  return NextResponse.json(body, {
    status,
    headers: {
      ...NO_STORE_HEADERS,
      ...PUBLIC_ARTIST_API_COMMON_HEADERS,
      ...rateLimitHeaders,
      ...extraHeaders,
    },
  });
}

function lookupResponse(
  channel: YouTubeResolvedChannel,
  profile: CreatorLookupProfile | null
): Record<string, unknown> {
  const channelUrl = `https://www.youtube.com/channel/${channel.channelId}`;
  const youtubeUrl = channel.handle
    ? `https://www.youtube.com/@${channel.handle}`
    : channelUrl;
  const links = [{ platform: 'youtube', url: youtubeUrl }];
  if (profile?.spotifyUrl) {
    links.push({ platform: 'spotify', url: profile.spotifyUrl });
  }
  if (profile?.appleMusicUrl) {
    links.push({ platform: 'apple_music', url: profile.appleMusicUrl });
  }

  return {
    exists: profile !== null,
    creator: {
      name: profile?.displayName ?? channel.title,
      handle: channel.handle,
      bio: profile?.bio ?? channel.description,
      location: profile?.location ?? channel.country,
      avatarUrl: profile?.avatarUrl ?? channel.avatarUrl,
      channel: {
        platform: 'youtube',
        id: channel.channelId,
        url: channelUrl,
      },
      links,
    },
    jovie: profile
      ? {
          username: profile.username,
          profileUrl: `${BASE_URL}/${profile.username}`,
          apiUrl: `${BASE_URL}/api/v1/${profile.username}`,
        }
      : null,
  };
}

export async function GET(request: Request) {
  const rateLimit = await publicArtistApiLimiter.limit(getClientIP(request));
  if (!rateLimit.success && rateLimit.unavailable) {
    return response(
      {
        error: 'Creator lookup temporarily unavailable',
        code: 'RATE_LIMIT_UNAVAILABLE',
      },
      503,
      {},
      {
        'RateLimit-Policy': PUBLIC_ARTIST_API_RATE_LIMIT_POLICY_VALUE,
        'Retry-After': RETRY_AFTER_SERVICE,
      }
    );
  }

  const rateLimitHeaders = createRateLimitHeaders(rateLimit, {
    policyName: PUBLIC_ARTIST_API_RATE_LIMIT_POLICY,
    windowSeconds: PUBLIC_ARTIST_API_RATE_LIMIT_WINDOW_SECONDS,
  });
  if (!rateLimit.success) {
    return response(
      { error: 'Too many requests', code: 'RATE_LIMITED' },
      429,
      rateLimitHeaders
    );
  }

  const input = new URL(request.url).searchParams.get('input') ?? '';
  try {
    const result = await lookupCreator(input);
    if (result.kind === 'invalid_input') {
      return response(
        {
          error:
            'Use a YouTube channel URL or an explicit youtube:<handle-or-channel-id> value',
          code: 'INVALID_CREATOR_LOOKUP',
        },
        400,
        rateLimitHeaders
      );
    }
    if (result.kind === 'channel_not_found') {
      return response(
        { error: 'Creator not found', code: 'CREATOR_NOT_FOUND' },
        404,
        rateLimitHeaders
      );
    }
    if (result.kind === 'ambiguous') {
      return response(
        {
          error: 'Multiple public profiles claim this channel identity',
          code: 'CREATOR_LOOKUP_AMBIGUOUS',
        },
        409,
        rateLimitHeaders
      );
    }

    return NextResponse.json(lookupResponse(result.channel, result.profile), {
      headers: {
        ...PUBLIC_ARTIST_API_COMMON_HEADERS,
        ...rateLimitHeaders,
        'Cache-Control': PUBLIC_ARTIST_API_PROFILE_CACHE_CONTROL,
      },
    });
  } catch (error) {
    if (error instanceof YouTubeDataApiUnavailableError) {
      return response(
        {
          error: 'Creator lookup temporarily unavailable',
          code: 'CREATOR_LOOKUP_UNAVAILABLE',
        },
        503,
        {},
        {
          'RateLimit-Policy': PUBLIC_ARTIST_API_RATE_LIMIT_POLICY_VALUE,
          'Retry-After': RETRY_AFTER_SERVICE,
        }
      );
    }
    await captureError('Creator lookup failed', error, {
      route: '/api/v1/creators/lookup',
    });
    return response(
      {
        error: 'Creator lookup temporarily unavailable',
        code: 'CREATOR_LOOKUP_UNAVAILABLE',
      },
      503,
      {},
      {
        'RateLimit-Policy': PUBLIC_ARTIST_API_RATE_LIMIT_POLICY_VALUE,
        'Retry-After': RETRY_AFTER_SERVICE,
      }
    );
  }
}
