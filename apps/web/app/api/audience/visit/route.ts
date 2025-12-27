<<<<<<< /Users/timwhite/Documents/GitHub/TBF/Jovie/apps/web/app/api/audience/visit/route.ts
<<<<<<< /Users/timwhite/Documents/GitHub/TBF/Jovie/apps/web/app/api/audience/visit/route.ts

import { and, eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';

=======

import { and, sql as drizzleSql, eq } from 'drizzle-orm';
=======
import { sql as drizzleSql, eq } from 'drizzle-orm';
>>>>>>> /Users/timwhite/.windsurf/worktrees/Jovie/Jovie-379d7b44/apps/web/app/api/audience/visit/route.ts
import { type NextRequest, NextResponse } from 'next/server';

>>>>>>> /Users/timwhite/.windsurf/worktrees/Jovie/Jovie-379d7b44/apps/web/app/api/audience/visit/route.ts

import { z } from 'zod';
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
import { detectBot } from '@/lib/utils/bot-detection';
import { extractClientIP } from '@/lib/utils/ip-extraction';
import {
  checkPublicRateLimit,
  getPublicRateLimitStatus,
} from '@/lib/utils/rate-limit';
import {
  createFingerprint,
  deriveIntentLevel,
  trimHistory,
} from '../lib/audience-utils';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const visitSchema = z.object({
  profileId: z.string().uuid(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  referrer: z.string().optional(),
  geoCity: z.string().optional(),
  geoCountry: z.string().optional(),
  deviceType: z.enum(['mobile', 'desktop', 'tablet', 'unknown']).optional(),
  // HMAC-SHA256 signed tracking token for request authentication
  trackingToken: z.string().optional(),
});

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
    if (checkPublicRateLimit(clientIP, 'visit')) {
      const status = getPublicRateLimitStatus(clientIP, 'visit');
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        {
          status: 429,
          headers: {
            ...NO_STORE_HEADERS,
            'Retry-After': String(status.retryAfterSeconds),
            'X-RateLimit-Limit': String(status.limit),
            'X-RateLimit-Remaining': String(status.remaining),
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
      const [inserted] = await tx
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
          geoCity: resolvedGeoCity ?? null,
          geoCountry: resolvedGeoCountry ?? null,
          deviceType: normalizedDevice,
          referrerHistory: referrerEntry,
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
        })
        .returning({ id: audienceMembers.id });

      if (inserted) {
        return;
      }

      const lockedExistingResult = await tx.execute(
        drizzleSql`
          select
            id,
            visits,
            latest_actions as "latestActions",
            referrer_history as "referrerHistory",
            engagement_score as "engagementScore",
            geo_city as "geoCity",
            geo_country as "geoCountry"
          from audience_members
          where creator_profile_id = ${profileId}
            and fingerprint = ${fingerprint}
          limit 1
          for update
        `
      );

      const existing =
        (lockedExistingResult.rows[0] as
          | {
              id: string;
              visits: number | null;
              latestActions: Record<string, unknown>[] | null;
              referrerHistory: Record<string, unknown>[] | null;
              engagementScore: number | null;
              geoCity: string | null;
              geoCountry: string | null;
            }
          | undefined) ?? undefined;

      if (!existing) {
        throw new Error('Unable to resolve audience member for visit');
      }

      const updatedVisits = (existing.visits ?? 0) + 1;
      const actionCount = Array.isArray(existing.latestActions)
        ? existing.latestActions.length
        : 0;
      const updatedIntent = deriveIntentLevel(updatedVisits, actionCount);
      const updatedScore = (existing.engagementScore ?? 0) + 1;
      const previousReferrers = Array.isArray(existing.referrerHistory)
        ? existing.referrerHistory
        : [];
      const referrerHistory = trimHistory(
        [...referrerEntry, ...previousReferrers],
        3
      );
      const geoCityValue = resolvedGeoCity ?? existing.geoCity ?? null;
      const geoCountryValue = resolvedGeoCountry ?? existing.geoCountry ?? null;

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
    });

    return NextResponse.json(
      { success: true, fingerprint },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('[Audience Visit] Error', error);
    return NextResponse.json(
      { error: 'Unable to record visit' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
