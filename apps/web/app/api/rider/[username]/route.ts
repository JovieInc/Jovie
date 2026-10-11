import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { creatorProfileRiders } from '@/lib/db/schema/riders';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS, RETRY_AFTER_SERVICE } from '@/lib/http/headers';
import { scheduleAfter } from '@/lib/next/schedule-after';
import { getPublicProfileDiscoveryExclusionResponse } from '@/lib/profile/public-profile-discovery-response';
import {
  createRateLimitHeaders,
  getClientIP,
  riderPublicAccessLimiter,
  riderUnlockLimiter,
} from '@/lib/rate-limit';
import {
  createRiderAccessCookieValue,
  RIDER_ACCESS_COOKIE_TTL_MS,
  riderAccessCookieName,
  verifyRiderAccessCookieValue,
  verifyRiderLinkToken,
  verifyRiderPassword,
} from '@/lib/rider/access.server';
import { renderRiderHtml, renderRiderMarkdown } from '@/lib/rider/render';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NOT_FOUND = { error: 'Not found' } as const;
const PASSWORD_REQUIRED = {
  error: 'Password required',
  code: 'RIDER_PASSWORD_REQUIRED',
} as const;

const internalError = () => json({ error: 'Internal Server Error' }, 500);

const json = (body: object, status: number, headers?: HeadersInit) =>
  NextResponse.json(body, {
    status,
    headers: { ...NO_STORE_HEADERS, ...headers },
  });

async function loadProfileWithRider(usernameNormalized: string) {
  const [row] = await db
    .select({
      profileId: creatorProfiles.id,
      username: creatorProfiles.username,
      displayName: creatorProfiles.displayName,
      isPublic: creatorProfiles.isPublic,
      riderId: creatorProfileRiders.id,
      visibility: creatorProfileRiders.visibility,
      passwordHash: creatorProfileRiders.passwordHash,
      technical: creatorProfileRiders.technical,
      hospitality: creatorProfileRiders.hospitality,
    })
    .from(creatorProfiles)
    .leftJoin(
      creatorProfileRiders,
      eq(creatorProfileRiders.creatorProfileId, creatorProfiles.id)
    )
    .where(eq(creatorProfiles.usernameNormalized, usernameNormalized))
    .limit(1);
  return row ?? null;
}

/** Public gated rider read/export; `private`/bad-token/private-profile → 404. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username: rawUsername } = await params;
  const username = rawUsername?.toLowerCase().trim();
  if (!username) return json({ error: 'Invalid username' }, 400);

  const requestExclusion = getPublicProfileDiscoveryExclusionResponse(
    username,
    'Not found'
  );
  if (requestExclusion) return requestExclusion;

  const ip = getClientIP(request);
  const rateLimit = await riderPublicAccessLimiter.limit(ip);
  if (!rateLimit.success && rateLimit.unavailable) {
    return json(
      { error: 'Temporarily unavailable', code: 'RATE_LIMIT_UNAVAILABLE' },
      503,
      { 'Retry-After': RETRY_AFTER_SERVICE }
    );
  }
  if (!rateLimit.success) {
    return json(
      { error: 'Too many requests', code: 'RATE_LIMITED' },
      429,
      createRateLimitHeaders(rateLimit)
    );
  }

  try {
    const row = await loadProfileWithRider(username);
    if (!row?.riderId || !row.visibility) {
      return json(NOT_FOUND, 404);
    }
    const profileExclusion = getPublicProfileDiscoveryExclusionResponse(
      {
        handle: row.username,
        displayName: row.displayName,
        isPublic: row.isPublic,
      },
      'Not found'
    );
    if (profileExclusion) return profileExclusion;

    if (
      row.visibility === 'private' ||
      (row.visibility === 'profile_public' && !row.isPublic) ||
      (row.visibility === 'link_only' &&
        !verifyRiderLinkToken(
          row.profileId,
          request.nextUrl.searchParams.get('token')
        ))
    ) {
      return json(NOT_FOUND, 404);
    }

    if (row.passwordHash) {
      const cookie = request.cookies.get(riderAccessCookieName(row.profileId));
      if (!verifyRiderAccessCookieValue(row.profileId, cookie?.value)) {
        return json(PASSWORD_REQUIRED, 401);
      }
    }

    const format = request.nextUrl.searchParams.get('format');
    const renderInput = {
      artistName: row.displayName ?? row.username,
      technical: row.technical ?? [],
      hospitality: row.hospitality ?? [],
    };
    if (format === 'markdown' || format === 'html') {
      const isMarkdown = format === 'markdown';
      const body = isMarkdown
        ? renderRiderMarkdown(renderInput)
        : renderRiderHtml(renderInput);
      return new NextResponse(body, {
        headers: {
          'Content-Type': isMarkdown
            ? 'text/markdown; charset=utf-8'
            : 'text/html; charset=utf-8',
          'Content-Disposition': `attachment; filename="${`${row.username}-rider.${isMarkdown ? 'md' : 'html'}`.replaceAll(/[^a-zA-Z0-9._-]/g, '_')}"`,
          ...NO_STORE_HEADERS,
        },
      });
    }

    return json(
      {
        artist: {
          username: row.username,
          name: row.displayName ?? row.username,
        },
        rider: {
          technical: row.technical ?? [],
          hospitality: row.hospitality ?? [],
        },
      },
      200
    );
  } catch (error) {
    scheduleAfter(() =>
      captureError('Public rider read failed', error, {
        route: '/api/rider/[username]',
        username,
      })
    );
    return internalError();
  }
}

/** Password unlock → short-lived HttpOnly cookie; durably rate-limited. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username: rawUsername } = await params;
  const username = rawUsername?.toLowerCase().trim();
  if (!username) return json({ error: 'Invalid username' }, 400);

  const body = (await request.json().catch(() => null)) as {
    password?: unknown;
  } | null;
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!password || password.length > 200) {
    return json({ error: 'Invalid password' }, 400);
  }

  const ip = getClientIP(request);
  const rateLimit = await riderUnlockLimiter.limit(`${ip}:${username}`);
  if (!rateLimit.success) {
    return json(
      { error: 'Too many requests', code: 'RATE_LIMITED' },
      429,
      createRateLimitHeaders(rateLimit)
    );
  }

  try {
    const row = await loadProfileWithRider(username);
    const canUnlock =
      row?.riderId &&
      row.visibility !== 'private' &&
      (row.visibility !== 'profile_public' || row.isPublic) &&
      row.passwordHash &&
      verifyRiderPassword(password, row.passwordHash);
    if (!canUnlock || !row) {
      return json({ error: 'Invalid password' }, 401);
    }

    const cookieValue = createRiderAccessCookieValue(row.profileId);
    if (!cookieValue) {
      return internalError();
    }
    const response = json({ ok: true }, 200);
    response.cookies.set(riderAccessCookieName(row.profileId), cookieValue, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: Math.floor(RIDER_ACCESS_COOKIE_TTL_MS / 1000),
      path: '/api/rider',
    });
    return response;
  } catch (error) {
    scheduleAfter(() =>
      captureError('Rider unlock failed', error, {
        route: '/api/rider/[username]',
        username,
      })
    );
    return internalError();
  }
}
