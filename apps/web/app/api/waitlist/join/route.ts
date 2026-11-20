import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { env } from '@/lib/env';
import { captureError } from '@/lib/error-tracking';
import {
  createRateLimitHeaders,
  getClientIP,
  waitlistJoinLimiter,
} from '@/lib/rate-limit';
import { spotifyClient } from '@/lib/spotify/client';
import {
  classifyTurnstileFailure,
  isTurnstileConfigured,
  verifyTurnstileToken,
} from '@/lib/turnstile/verify';
import { logger } from '@/lib/utils/logger';
import { joinWaitlistWithRole } from '@/lib/waitlist/role-entry';
import {
  momTestAnswersSchema,
  qualifyRoleEntrant,
  type SpotifyArtistReader,
  spotifyArtistIdSchema,
} from '@/lib/waitlist/role-qualification';
import { WAITLIST_ROLE_VALUES } from '@/lib/waitlist/roles';

// Kept here, not in lib/waitlist/roles.ts, so the homepage's waitlist form
// does not download zod.
const waitlistRoleSchema = z.enum(WAITLIST_ROLE_VALUES);
/**
 * Anonymous waitlist join. Bot protection matches the public changelog form:
 * a durable per-IP limiter (1 per 10 s, Redis, denies on outage) and
 * Cloudflare Turnstile. The route stays live whether the signup kill switch
 * (`FEATURE_PUBLIC_SIGNUP_CLOSED`) is on or off — the homepage waitlist role
 * form posts here in both modes (Tim, 2026-11-09). A known email gets the
 * same response as a new one, so the form never reveals who is waitlisted.
 */
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const joinSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: waitlistRoleSchema,
  name: z.string().trim().min(1).max(120).optional(),
  turnstileToken: z.string().max(4096).optional(),
  // Request-access qualification (docs/ONBOARDING_QUALIFICATION_SYSTEM.md).
  // Optional, so today's form keeps working unchanged.
  spotifyArtistId: spotifyArtistIdSchema.optional(),
  momTest: momTestAnswersSchema.optional(),
});

/**
 * The server's own read of the picked artist. The batch endpoint returns no
 * row for an unknown id (scored as unresolved) and throws when Spotify is
 * unreachable (left unscored), so the two never blur.
 */
/**
 * The client's own timeout and retries can outlast the function, so the join
 * waits at most this long for Spotify and then saves the entrant unscored.
 */
const SPOTIFY_QUALIFY_DEADLINE_MS = 3_000;

const readSpotifyArtist: SpotifyArtistReader = async artistId => {
  if (!spotifyClient.isAvailable()) throw new Error('Spotify unavailable');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('Spotify read timed out')),
      SPOTIFY_QUALIFY_DEADLINE_MS
    );
  });
  const [artist] = await Promise.race([
    spotifyClient.getArtists([artistId]),
    deadline,
  ]).finally(() => clearTimeout(timer));
  return artist
    ? {
        id: artist.spotifyId,
        name: artist.name,
        followers: artist.followerCount,
        popularity: artist.popularity,
      }
    : null;
};

function json(body: Record<string, unknown>, status: number, headers = {}) {
  return NextResponse.json(body, {
    status,
    headers: { ...NO_STORE_HEADERS, ...headers },
  });
}

async function verifyTurnstile(
  token: string,
  ip: string,
  hostname: string | null
): Promise<'verified' | 'rejected' | 'unavailable'> {
  if (!isTurnstileConfigured()) {
    if (env.NODE_ENV === 'production') {
      logger.error('TURNSTILE_SECRET_KEY not configured in production');
      return 'unavailable';
    }
    return 'verified';
  }
  const result = await verifyTurnstileToken(token, ip, hostname);
  if (result.success) return 'verified';
  return classifyTurnstileFailure(result);
}

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);
  const rateLimitResult = await waitlistJoinLimiter.limit(ip);
  if (!rateLimitResult.success) {
    const unavailable =
      rateLimitResult.reason?.includes('temporarily unavailable') ?? false;
    return json(
      {
        error: unavailable
          ? 'The waitlist is temporarily unavailable.'
          : 'Too many requests. Please try again in a moment.',
      },
      unavailable ? 503 : 429,
      {
        ...createRateLimitHeaders(rateLimitResult),
        ...(unavailable ? { 'Retry-After': '10' } : {}),
      }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }
  const parsed = joinSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: 'Choose a role and enter a valid email.' }, 400);
  }

  const host =
    request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    request.headers.get('host') ||
    null;
  const turnstile = await verifyTurnstile(
    parsed.data.turnstileToken ?? '',
    ip,
    host
  );
  if (turnstile === 'rejected') {
    return json({ error: 'Bot verification failed. Please try again.' }, 403);
  }
  if (turnstile === 'unavailable') {
    return json(
      { error: 'Bot verification unavailable. Please try again.' },
      503
    );
  }

  const qualification = await qualifyRoleEntrant(
    {
      spotifyArtistId: parsed.data.spotifyArtistId ?? null,
      momTest: parsed.data.momTest ?? null,
    },
    readSpotifyArtist
  );

  try {
    await joinWaitlistWithRole({
      email: parsed.data.email,
      role: parsed.data.role,
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      ...(qualification ? { qualification } : {}),
    });
  } catch (error) {
    logger.error('[api/waitlist/join] join failed', error);
    await captureError('Waitlist role join failed', error, {
      route: '/api/waitlist/join',
      method: 'POST',
    });
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }

  return json({ state: 'joined' }, 201);
}
