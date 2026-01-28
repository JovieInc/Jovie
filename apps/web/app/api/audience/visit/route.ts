import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import {
  checkVisitRateLimit,
  getRateLimitHeaders,
} from '@/lib/analytics/tracking-rate-limit';
import {
  isTrackingTokenEnabled,
  validateTrackingToken,
} from '@/lib/analytics/tracking-token';
import { db } from '@/lib/db';
import { audienceMembers, creatorProfiles } from '@/lib/db/schema';
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

export async function POST(request: NextRequest) {
  try {
    // Extract client IP for rate limiting
    const clientIP = extractClientIP(request.headers);

    // Public rate limiting check (per-IP)
    const rateLimitStatus = publicVisitLimiter.getStatus(clientIP);
    if (rateLimitStatus.blocked) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        {
          status: 429,
          headers: {
            ...NO_STORE_HEADERS,
            'Retry-After': String(rateLimitStatus.retryAfterSeconds),
            'X-RateLimit-Limit': String(rateLimitStatus.limit),
            'X-RateLimit-Remaining': String(rateLimitStatus.remaining),
          },
        }
      );
    }

    // Trigger rate limit counter increment (fire-and-forget)
    void publicVisitLimiter.limit(clientIP);

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
    const resolvedReferrer =
      referrer ?? request.headers.get('referer') ?? undefined;
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
          })
          .where(eq(audienceMembers.id, existing.id));
        return;
      }

      await tx.insert(audienceMembers).values({
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
        tags: [],
        latestActions: [],
        updatedAt: now,
        createdAt: now,
      });
    });

    return NextResponse.json(
      { success: true, fingerprint },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('[Audience Visit] Error', error);
    return NextResponse.json(
      { error: 'Unable to record visit' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
