import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import {
  checkVisitRateLimit,
  getRateLimitHeaders,
} from '@/lib/analytics/tracking-rate-limit';
import {
  isTrackingTokenEnabled,
  validateTrackingToken,
} from '@/lib/analytics/tracking-token';
import { type DbOrTransaction, db } from '@/lib/db';
import { audienceMembers, dailyProfileViews } from '@/lib/db/schema/analytics';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { publicVisitLimiter } from '@/lib/rate-limit';
import { detectBot } from '@/lib/utils/bot-detection';
import { extractClientIP } from '@/lib/utils/ip-extraction';
import { logger } from '@/lib/utils/logger';
import { visitSchema } from '@/lib/validation/schemas';
import {
  createFingerprint,
  deriveIntentLevel,
  trimHistory,
} from '../lib/audience-utils';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const INTERNAL_HOST_SUFFIXES = ['jov.ie', 'jovie.fm'];

function isInternalTrafficReferrer(referrerUrl: string): boolean {
  try {
    const hostname = new URL(referrerUrl).hostname.toLowerCase();
    return INTERNAL_HOST_SUFFIXES.some(
      suffix => hostname === suffix || hostname.endsWith(`.${suffix}`)
    );
  } catch {
    return false;
  }
}

/**
 * Check if a referrer URL is from the same origin as the request.
 * Used to filter out the HTTP Referer header on same-origin fetch() calls,
 * which would incorrectly record the app's own URL as the traffic source.
 */
function isSameOriginReferrer(
  referrerUrl: string,
  requestUrl: string
): boolean {
  try {
    const referrerHost = new URL(referrerUrl).hostname;
    const requestHost = new URL(requestUrl).hostname;
    return referrerHost === requestHost;
  } catch {
    return false;
  }
}

function inferDeviceType(
  userAgent: string | null
): 'mobile' | 'desktop' | 'tablet' | 'unknown' {
  if (!userAgent) return 'unknown';
  const ua = userAgent.toLowerCase();
  if (ua.includes('ipad') || ua.includes('tablet')) return 'tablet';
  if (ua.includes('mobi') || ua.includes('iphone') || ua.includes('android')) {
    return 'mobile';
  }
  return 'desktop';
}

function getPgErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const err = error as { code?: string; cause?: { code?: string } };
  return err.code ?? err.cause?.code;
}

async function incrementDailyProfileViews(
  tx: DbOrTransaction,
  profileId: string,
  viewDate: string,
  now: Date
): Promise<void> {
  const updatedRows = await tx
    .update(dailyProfileViews)
    .set({
      viewCount: drizzleSql`${dailyProfileViews.viewCount} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(dailyProfileViews.creatorProfileId, profileId),
        eq(dailyProfileViews.viewDate, viewDate)
      )
    )
    .returning({ id: dailyProfileViews.id });

  if (updatedRows.length > 0) {
    return;
  }

  try {
    await tx.insert(dailyProfileViews).values({
      creatorProfileId: profileId,
      viewDate,
      viewCount: 1,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    if (getPgErrorCode(error) !== '23505') {
      throw error;
    }

    await tx
      .update(dailyProfileViews)
      .set({
        viewCount: drizzleSql`${dailyProfileViews.viewCount} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(dailyProfileViews.creatorProfileId, profileId),
          eq(dailyProfileViews.viewDate, viewDate)
        )
      );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Extract client IP for rate limiting
    const clientIP = extractClientIP(request.headers);

    // Atomically check-and-decrement to avoid TOCTOU race
    const ipRateLimitResult = await publicVisitLimiter.limit(clientIP);
    if (!ipRateLimitResult.success) {
      const retryAfterSeconds = Math.ceil(
        (ipRateLimitResult.reset.getTime() - Date.now()) / 1000
      );
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        {
          status: 429,
          headers: {
            ...NO_STORE_HEADERS,
            'Retry-After': String(Math.max(retryAfterSeconds, 1)),
            'X-RateLimit-Limit': String(ipRateLimitResult.limit),
            'X-RateLimit-Remaining': String(ipRateLimitResult.remaining),
          },
        }
      );
    }

    // Bot detection - silently skip recording for bots
    const botResult = detectBot(request, '/api/audience/visit');
    if (botResult.isBot) {
      // Return success but don't record - prevents metric inflation
      return NextResponse.json(
        { success: true, fingerprint: 'bot-filtered' },
        { headers: NO_STORE_HEADERS }
      );
    }

    const body = await request.json();
    const parsed = visitSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid visit payload' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const {
      profileId,
      ipAddress,
      userAgent,
      referrer,
      geoCity,
      geoCountry,
      deviceType,
      trackingToken,
      utmParams,
    } = parsed.data;

    // Validate tracking token if enabled
    if (isTrackingTokenEnabled()) {
      const tokenValidation = validateTrackingToken(trackingToken, profileId);
      if (!tokenValidation.valid) {
        return NextResponse.json(
          { error: 'Invalid tracking token', reason: tokenValidation.error },
          { status: 401, headers: NO_STORE_HEADERS }
        );
      }
    }

    const resolvedUserAgent =
      userAgent ?? request.headers.get('user-agent') ?? undefined;
    const resolvedIpAddress = ipAddress ?? clientIP ?? undefined;
    // Use the client-provided referrer (document.referrer) if available.
    // The HTTP Referer header on same-origin fetch() is the current page URL,
    // NOT the external referrer, so we filter out self-referrals from the fallback.
    const httpReferer = request.headers.get('referer') ?? undefined;
    const isSelfReferral = httpReferer
      ? isSameOriginReferrer(httpReferer, request.url)
      : false;
    const fallbackReferrer = isSelfReferral ? undefined : httpReferer;
    const rawReferrer = referrer ?? fallbackReferrer;
    const resolvedReferrer =
      rawReferrer && isInternalTrafficReferrer(rawReferrer)
        ? undefined
        : rawReferrer;
    const resolvedGeoCity =
      geoCity ?? request.headers.get('x-vercel-ip-city') ?? undefined;
    const resolvedGeoCountry =
      geoCountry ??
      request.headers.get('x-vercel-ip-country') ??
      request.headers.get('cf-ipcountry') ??
      undefined;

    // Per-creator rate limiting (50k visits/hour)
    const rateLimitResult = await checkVisitRateLimit(
      profileId,
      resolvedIpAddress
    );
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', reason: rateLimitResult.reason },
        {
          status: 429,
          headers: {
            ...NO_STORE_HEADERS,
            ...getRateLimitHeaders(rateLimitResult),
          },
        }
      );
    }

    // Validate profile exists AND is public before recording
    const [profile] = await db
      .select({ id: creatorProfiles.id, isPublic: creatorProfiles.isPublic })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, profileId))
      .limit(1);

    if (!profile) {
      return NextResponse.json(
        { error: 'Creator profile not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    // Only record visits for public profiles
    if (!profile.isPublic) {
      return NextResponse.json(
        { error: 'Profile is not public' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const fingerprint = createFingerprint(resolvedIpAddress, resolvedUserAgent);
    const normalizedDevice =
      deviceType ?? inferDeviceType(resolvedUserAgent ?? null);
    const now = new Date();
    const referrerEntry = resolvedReferrer
      ? [{ url: resolvedReferrer.trim(), timestamp: now.toISOString() }]
      : [];

    await withSystemIngestionSession(async tx => {
      const viewDate = now.toISOString().slice(0, 10);

      await incrementDailyProfileViews(tx, profileId, viewDate, now);

      const [existing] = await tx
        .select({
          id: audienceMembers.id,
          visits: audienceMembers.visits,
          latestActions: audienceMembers.latestActions,
          referrerHistory: audienceMembers.referrerHistory,
          engagementScore: audienceMembers.engagementScore,
          geoCity: audienceMembers.geoCity,
          geoCountry: audienceMembers.geoCountry,
          deviceType: audienceMembers.deviceType,
          utmParams: audienceMembers.utmParams,
        })
        .from(audienceMembers)
        .where(
          and(
            eq(audienceMembers.creatorProfileId, profileId),
            eq(audienceMembers.fingerprint, fingerprint)
          )
        )
        .limit(1);

      const updatedVisits = (existing?.visits ?? 0) + 1;
      const actionCount = Array.isArray(existing?.latestActions)
        ? existing.latestActions.length
        : 0;
      const updatedIntent = deriveIntentLevel(updatedVisits, actionCount);
      const updatedScore = (existing?.engagementScore ?? 0) + 1;
      const previousReferrers = Array.isArray(existing?.referrerHistory)
        ? existing.referrerHistory
        : [];
      const referrerHistory = trimHistory(
        [...referrerEntry, ...previousReferrers],
        3
      );
      const geoCityValue = resolvedGeoCity ?? existing?.geoCity ?? null;
      const geoCountryValue =
        resolvedGeoCountry ?? existing?.geoCountry ?? null;

      // Merge UTM params: new visit's UTM overwrites if present, else keep existing
      const hasUtmParams =
        !!utmParams &&
        Object.values(utmParams).some(
          value => typeof value === 'string' && value.length > 0
        );
      const resolvedUtmParams = hasUtmParams
        ? utmParams
        : (existing?.utmParams ?? {});

      if (existing) {
        await tx
          .update(audienceMembers)
          .set({
            visits: updatedVisits,
            lastSeenAt: now,
            updatedAt: now,
            engagementScore: updatedScore,
            intentLevel: updatedIntent,
            geoCity: geoCityValue,
            geoCountry: geoCountryValue,
            deviceType: normalizedDevice,
            referrerHistory,
            ...(utmParams && { utmParams: resolvedUtmParams }),
          })
          .where(eq(audienceMembers.id, existing.id));
        return;
      }

      await tx
        .insert(audienceMembers)
        .values({
          creatorProfileId: profileId,
          fingerprint,
          type: 'anonymous',
          displayName: 'Visitor',
          firstSeenAt: now,
          lastSeenAt: now,
          visits: 1,
          engagementScore: 1,
          intentLevel: 'low',
          geoCity: geoCityValue,
          geoCountry: geoCountryValue,
          deviceType: normalizedDevice,
          referrerHistory,
          utmParams: resolvedUtmParams,
          tags: [],
          latestActions: [],
          updatedAt: now,
          createdAt: now,
        })
        .onConflictDoNothing({
          target: [
            audienceMembers.creatorProfileId,
            audienceMembers.fingerprint,
          ],
          where: drizzleSql`${audienceMembers.fingerprint} IS NOT NULL`,
        });
    });

    return NextResponse.json(
      { success: true, fingerprint },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('[Audience Visit] Error', error);
    await captureError('Audience visit tracking failed', error, {
      route: '/api/audience/visit',
      method: 'POST',
    });
    return NextResponse.json(
      { error: 'Unable to record visit' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
