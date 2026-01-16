import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  audienceMembers,
  clickEvents,
  creatorProfiles,
  socialLinks,
} from '@/lib/db/schema';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import {
  createRateLimitHeaders,
  trackingIpClicksLimiter,
} from '@/lib/rate-limit';
import { detectPlatformFromUA } from '@/lib/utils';
import { extractClientIP } from '@/lib/utils/ip-extraction';
import { normalizeString } from '@/lib/utils/string-utils';
import { LinkType } from '@/types/db';
import {
  createFingerprint,
  deriveIntentLevel,
  getActionWeight,
  trimHistory,
} from '../audience/lib/audience-utils';

// API routes should be dynamic
export const dynamic = 'force-dynamic';

export const runtime = 'nodejs';

// Valid link types enum for validation
const VALID_LINK_TYPES = ['listen', 'social', 'tip', 'other'] as const;

// Username validation regex
// (alphanumeric, underscore, hyphen, 3-30 chars)
const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,30}$/;

/**
 * Validate if a string is a valid URL
 */
function isValidURL(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function inferAudienceDeviceType(
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

export async function POST(request: NextRequest) {
  try {
    // Rate limiting: Check IP-based rate limit for track events
    const ipAddress = extractClientIP(request.headers);
    const rateLimitResult = await trackingIpClicksLimiter.limit(ipAddress);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Too many tracking requests. Please try again later.' },
        {
          status: 429,
          headers: {
            ...NO_STORE_HEADERS,
            ...createRateLimitHeaders(rateLimitResult),
          },
        }
      );
    }

    const body = await request.json();
    const {
      handle,
      linkType,
      target,
      linkId,
      source,
    }: {
      handle: string;
      linkType: LinkType;
      target: string;
      linkId?: string;
      source?: unknown;
    } = body;

    const resolvedSource = (() => {
      if (typeof source !== 'string') return undefined;
      const normalized = normalizeString(source);
      if (normalized === 'qr') return 'qr';
      if (normalized === 'link') return 'link';
      return undefined;
    })();

    // Validate required fields
    if (!handle || !linkType || !target) {
      return NextResponse.json(
        {
          error:
            'Missing required fields: handle, linkType, and target ' +
            'are required',
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Validate handle format
    if (!USERNAME_REGEX.test(handle)) {
      return NextResponse.json(
        {
          error:
            'Invalid handle format. Must be 3-30 alphanumeric ' +
            'characters, underscores, or hyphens',
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Validate linkType is a valid enum value
    if (
      !VALID_LINK_TYPES.includes(linkType as (typeof VALID_LINK_TYPES)[number])
    ) {
      return NextResponse.json(
        {
          error: `Invalid linkType. Must be one of: ${VALID_LINK_TYPES.join(
            ', '
          )}`,
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const looksLikeUrl =
      typeof target === 'string' &&
      (target.includes('://') || target.startsWith('www.'));
    if (looksLikeUrl && !isValidURL(target)) {
      return NextResponse.json(
        { error: 'Invalid target URL format' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    if (typeof target !== 'string' || target.trim().length === 0) {
      return NextResponse.json(
        { error: 'Invalid target' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const userAgent = request.headers.get('user-agent');
    const platformDetected = detectPlatformFromUA(userAgent || undefined);
    // ipAddress already extracted above for rate limiting
    const referrer = request.headers.get('referer') ?? undefined;
    const geoCity = request.headers.get('x-vercel-ip-city') ?? undefined;
    const geoCountry =
      request.headers.get('x-vercel-ip-country') ??
      request.headers.get('cf-ipcountry') ??
      undefined;
    const audienceDeviceType = inferAudienceDeviceType(userAgent);
    const fingerprint = createFingerprint(ipAddress, userAgent);

    // Find the creator profile
    const [profile] = await db
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.usernameNormalized, handle.toLowerCase()))
      .limit(1);

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const [clickEvent] = await withSystemIngestionSession(async tx => {
      const [insertedMember] = await tx
        .insert(audienceMembers)
        .values({
          creatorProfileId: profile.id,
          fingerprint,
          type: 'anonymous',
          displayName: 'Visitor',
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
          visits: 0,
          engagementScore: 0,
          intentLevel: 'low',
          deviceType: audienceDeviceType,
          referrerHistory: referrer
            ? [
                {
                  url: referrer.trim(),
                  timestamp: new Date().toISOString(),
                },
              ]
            : [],
          latestActions: [],
          geoCity: geoCity ?? null,
          geoCountry: geoCountry ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing({
          target: [
            audienceMembers.creatorProfileId,
            audienceMembers.fingerprint,
          ],
          where: drizzleSql`${audienceMembers.fingerprint} IS NOT NULL`,
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

      const resolvedMember =
        insertedMember ??
        (
          await tx
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
                eq(audienceMembers.creatorProfileId, profile.id),
                eq(audienceMembers.fingerprint, fingerprint)
              )
            )
            .limit(1)
        )?.[0];

      if (!resolvedMember) {
        throw new Error('Unable to resolve audience member');
      }

      const now = new Date();
      const existingActions = Array.isArray(resolvedMember.latestActions)
        ? resolvedMember.latestActions
        : [];
      const actionEntry = {
        label: ACTION_LABELS[linkType] ?? 'interacted',
        type: linkType,
        platform: target,
        emoji: ACTION_ICONS[linkType] ?? '⭐',
        timestamp: now.toISOString(),
      };
      const latestActions = trimHistory([actionEntry, ...existingActions], 5);
      const actionCount = latestActions.length;
      const weight = getActionWeight(linkType);
      const updatedScore = (resolvedMember.engagementScore ?? 0) + weight;
      const intentLevel = deriveIntentLevel(
        resolvedMember.visits ?? 0,
        actionCount
      );

      await tx
        .update(audienceMembers)
        .set({
          lastSeenAt: now,
          updatedAt: now,
          engagementScore: updatedScore,
          intentLevel,
          latestActions,
          deviceType: audienceDeviceType,
          geoCity: geoCity ?? resolvedMember.geoCity ?? null,
          geoCountry: geoCountry ?? resolvedMember.geoCountry ?? null,
          spotifyConnected:
            Boolean(resolvedMember.spotifyConnected) || linkType === 'listen',
        })
        .where(eq(audienceMembers.id, resolvedMember.id));

      const [insertedClickEvent] = await tx
        .insert(clickEvents)
        .values({
          creatorProfileId: profile.id,
          linkType: linkType as 'listen' | 'social' | 'tip' | 'other',
          linkId: linkId || null,
          ipAddress,
          userAgent,
          referrer,
          country: geoCountry,
          city: geoCity,
          deviceType: platformDetected,
          metadata: resolvedSource
            ? { target, source: resolvedSource }
            : { target },
          audienceMemberId: resolvedMember.id,
        })
        .returning({ id: clickEvents.id });

      return insertedClickEvent ? [insertedClickEvent] : [];
    });

    if (!clickEvent) {
      await captureError(
        'Failed to insert click event',
        new Error('Database insert returned no data'),
        {
          handle,
          linkType,
          creatorProfileId: profile.id,
        }
      );
      return NextResponse.json(
        { error: 'Failed to log click event' },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    // Update social link click count in the background
    // Errors are captured but don't block the response
    if (linkType === 'social' && linkId) {
      db.update(socialLinks)
        .set({
          clicks: drizzleSql`${socialLinks.clicks} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(socialLinks.id, linkId))
        .then(() => {
          // Click count updated successfully
        })
        .catch(error => {
          // Ensure error is always captured even if background task fails
          void captureError('Failed to update social link click count', error, {
            route: '/api/track',
            creatorProfileId: profile.id,
            handle,
            linkId,
            linkType,
          });
        });
    }

    return NextResponse.json(
      { success: true, id: clickEvent.id },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Track API error', error, {
      route: '/api/track',
      method: 'POST',
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
