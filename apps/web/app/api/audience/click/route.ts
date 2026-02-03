import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import {
  checkClickRateLimit,
  getRateLimitHeaders,
} from '@/lib/analytics/tracking-rate-limit';
import {
  isTrackingTokenEnabled,
  validateTrackingToken,
} from '@/lib/analytics/tracking-token';
import { type DbOrTransaction, db } from '@/lib/db';
import { audienceMembers, clickEvents } from '@/lib/db/schema/analytics';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { publicClickLimiter } from '@/lib/rate-limit';
import { detectBot } from '@/lib/utils/bot-detection';
import { extractClientIP } from '@/lib/utils/ip-extraction';
import { logger } from '@/lib/utils/logger';
import { encryptIP } from '@/lib/utils/pii-encryption';
import { clickSchema } from '@/lib/validation/schemas';
import {
  createFingerprint,
  deriveIntentLevel,
  getActionWeight,
  trimHistory,
} from '../lib/audience-utils';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const ACTION_ICONS: Record<string, string> = {
  listen: '🎧',
  social: '📸',
  tip: '💸',
  other: '🔗',
};

const ACTION_LABELS: Record<string, string> = {
  listen: 'listened',
  social: 'tapped a social link',
  tip: 'sent a tip',
  other: 'clicked a link',
};

type AudienceMemberRecord = {
  id: string;
  visits: number | null;
  engagementScore: number | null;
  latestActions: Record<string, unknown>[] | null;
  geoCity: string | null;
  geoCountry: string | null;
  deviceType: string | null;
  spotifyConnected: boolean | null;
};

async function findAudienceMember(
  tx: DbOrTransaction,
  profileId: string,
  fingerprint: string,
  explicitId?: string
): Promise<AudienceMemberRecord | null> {
  if (explicitId) {
    const [result] = await tx
      .select({
        id: audienceMembers.id,
        visits: audienceMembers.visits,
        engagementScore: audienceMembers.engagementScore,
        latestActions: audienceMembers.latestActions,
        geoCity: audienceMembers.geoCity,
        geoCountry: audienceMembers.geoCountry,
        deviceType: audienceMembers.deviceType,
        spotifyConnected: audienceMembers.spotifyConnected,
      })
      .from(audienceMembers)
      .where(eq(audienceMembers.id, explicitId))
      .limit(1);

    if (result) {
      return result;
    }
  }

  const [member] = await tx
    .select({
      id: audienceMembers.id,
      visits: audienceMembers.visits,
      engagementScore: audienceMembers.engagementScore,
      latestActions: audienceMembers.latestActions,
      geoCity: audienceMembers.geoCity,
      geoCountry: audienceMembers.geoCountry,
      deviceType: audienceMembers.deviceType,
      spotifyConnected: audienceMembers.spotifyConnected,
    })
    .from(audienceMembers)
    .where(
      and(
        eq(audienceMembers.creatorProfileId, profileId),
        eq(audienceMembers.fingerprint, fingerprint)
      )
    )
    .limit(1);

  return member ?? null;
}

export async function POST(request: NextRequest) {
  try {
    // Extract client IP for rate limiting
    const clientIP = extractClientIP(request.headers);

    // Public rate limiting check (per-IP)
    const rateLimitStatus = publicClickLimiter.getStatus(clientIP);
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
    void publicClickLimiter.limit(clientIP);

    // Bot detection - detect but continue to record with isBot flag
    const botDetection = detectBot(request, '/api/audience/click');
    if (botDetection.isBot && botDetection.shouldBlock) {
      // Return success but don't record for blocked bots
      return NextResponse.json(
        { success: true, fingerprint: 'bot-filtered' },
        { headers: NO_STORE_HEADERS }
      );
    }

    const body = await request.json();
    const parsed = clickSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid click payload' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const {
      profileId,
      linkId,
      linkType,
      actionLabel,
      platform,
      ipAddress,
      userAgent,
      referrer,
      city,
      country,
      deviceType,
      os,
      browser,
      metadata,
      audienceMemberId,
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

    // Resolve IP address from body or headers
    const resolvedIP = ipAddress ?? clientIP ?? undefined;

    // Per-creator rate limiting (10k clicks/hour)
    const rateLimitResult = await checkClickRateLimit(profileId, resolvedIP);
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

    // Only record clicks for public profiles
    if (!profile.isPublic) {
      return NextResponse.json(
        { error: 'Profile is not public' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const fingerprint = createFingerprint(resolvedIP, userAgent);
    const normalizedDevice = deviceType ?? 'unknown';
    const now = new Date();

    // Encrypt IP address for storage (GDPR/CCPA compliance)
    const encryptedIP = encryptIP(resolvedIP);

    await withSystemIngestionSession(async tx => {
      let member = await findAudienceMember(
        tx,
        profileId,
        fingerprint,
        audienceMemberId
      );

      if (!member) {
        const [inserted] = await tx
          .insert(audienceMembers)
          .values({
            creatorProfileId: profileId,
            fingerprint,
            type: 'anonymous',
            displayName: 'Visitor',
            firstSeenAt: now,
            lastSeenAt: now,
            visits: 0,
            engagementScore: 0,
            intentLevel: 'low',
            deviceType: normalizedDevice,
            referrerHistory: [],
            latestActions: [],
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing({
            target: [
              audienceMembers.creatorProfileId,
              audienceMembers.fingerprint,
            ],
          })
          .returning({
            id: audienceMembers.id,
            visits: audienceMembers.visits,
            engagementScore: audienceMembers.engagementScore,
            latestActions: audienceMembers.latestActions,
            geoCity: audienceMembers.geoCity,
            geoCountry: audienceMembers.geoCountry,
            deviceType: audienceMembers.deviceType,
            spotifyConnected: audienceMembers.spotifyConnected,
          });

        if (inserted) {
          member = inserted;
        } else {
          // Another transaction inserted the row first; load the existing record.
          member = await findAudienceMember(tx, profileId, fingerprint);
        }
      }

      if (!member) {
        throw new Error('Unable to resolve audience member');
      }

      const existingActions = Array.isArray(member.latestActions)
        ? member.latestActions
        : [];
      const actionEntry = {
        label: actionLabel ?? ACTION_LABELS[linkType] ?? 'interacted',
        type: linkType,
        platform: platform ?? linkType,
        emoji: ACTION_ICONS[linkType] ?? '⭐',
        timestamp: now.toISOString(),
      };
      const latestActions = trimHistory([actionEntry, ...existingActions], 5);
      const actionCount = latestActions.length;
      const weight = getActionWeight(linkType);
      const updatedScore = (member.engagementScore ?? 0) + weight;
      const intentLevel = deriveIntentLevel(member.visits ?? 0, actionCount);

      await tx.insert(clickEvents).values({
        creatorProfileId: profileId,
        linkId,
        linkType,
        ipAddress: encryptedIP,
        userAgent,
        referrer,
        country,
        city,
        deviceType: normalizedDevice,
        os,
        browser,
        isBot: botDetection.isBot,
        metadata: metadata ?? {},
        audienceMemberId: member.id,
      });

      await tx
        .update(audienceMembers)
        .set({
          lastSeenAt: now,
          updatedAt: now,
          engagementScore: updatedScore,
          intentLevel,
          latestActions,
          deviceType: normalizedDevice,
          geoCity: city ?? member.geoCity ?? null,
          geoCountry: country ?? member.geoCountry ?? null,
          spotifyConnected:
            (member.spotifyConnected ?? false) || linkType === 'listen',
        })
        .where(eq(audienceMembers.id, member.id));
    });

    return NextResponse.json(
      { success: true, fingerprint },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('[Audience Click] Error', error);
    return NextResponse.json(
      { error: 'Unable to record click' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
