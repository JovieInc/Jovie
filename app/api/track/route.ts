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
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { detectPlatformFromUA } from '@/lib/utils';
import { extractClientIP } from '@/lib/utils/ip-extraction';
import { isSafeExternalUrl } from '@/lib/utils/url-encryption';
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

/**
 * Rate Limiting Status: NOT IMPLEMENTED
 * Following YC principle: "do things that don't scale until you have to"
 * Will add rate limiting when:
 * - Track events exceed ~50k/day
 * - Abuse/spam becomes measurable problem
 *
 * For now: basic input validation prevents most abuse
 */

// Valid link types enum for validation
const VALID_LINK_TYPES = ['listen', 'social', 'tip', 'other'] as const;

// Username validation regex (alphanumeric, underscore, hyphen, 3-30 chars)
const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,30}$/;

/**
 * Infer audience device type from user agent
 */
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
    const contentLengthHeader = request.headers.get('content-length');
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : 0;
    if (Number.isFinite(contentLength) && contentLength > 20_000) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

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
    } = body as {
      handle: string;
      linkType: LinkType;
      target: string;
      linkId?: string;
      source?: unknown;
    };

    const resolvedSource = (() => {
      if (typeof source !== 'string') return undefined;
      const normalized = source.trim().toLowerCase();
      if (normalized === 'qr') return 'qr';
      if (normalized === 'link') return 'link';
      return undefined;
    })();

    const normalizedHandle = typeof handle === 'string' ? handle.trim() : '';
    const normalizedTarget = typeof target === 'string' ? target.trim() : '';

    // Validate required fields
    if (!normalizedHandle || !linkType || !normalizedTarget) {
      return NextResponse.json(
        {
          error:
            'Missing required fields: handle, linkType, and target are required',
        },
        { status: 400 }
      );
    }

    // Validate handle format
    if (!USERNAME_REGEX.test(normalizedHandle)) {
      return NextResponse.json(
        {
          error:
            'Invalid handle format. Must be 3-30 alphanumeric characters, underscores, or hyphens',
        },
        { status: 400 }
      );
    }

    // Validate linkType is a valid enum value
    if (
      !VALID_LINK_TYPES.includes(linkType as (typeof VALID_LINK_TYPES)[number])
    ) {
      return NextResponse.json(
        {
          error: `Invalid linkType. Must be one of: ${VALID_LINK_TYPES.join(', ')}`,
        },
        { status: 400 }
      );
    }

    if (normalizedTarget.length > 500) {
      return NextResponse.json({ error: 'Invalid target' }, { status: 400 });
    }

    const looksLikeUrl =
      normalizedTarget.includes('://') || normalizedTarget.startsWith('www.');
    if (looksLikeUrl && !isSafeExternalUrl(normalizedTarget)) {
      return NextResponse.json(
        { error: 'Invalid target URL format' },
        { status: 400 }
      );
    }

    if (linkId && (typeof linkId !== 'string' || linkId.length > 64)) {
      return NextResponse.json({ error: 'Invalid linkId' }, { status: 400 });
    }

    const userAgent = request.headers.get('user-agent');
    const platformDetected = detectPlatformFromUA(userAgent || undefined);
    const ipAddress = extractClientIP(request.headers);
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
      .where(
        eq(creatorProfiles.usernameNormalized, normalizedHandle.toLowerCase())
      )
      .limit(1);

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const [clickEvent] = await withSystemIngestionSession(async tx => {
      const [existingMember] = await tx
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
        .limit(1);

      const resolvedMember = await (async () => {
        if (existingMember) {
          return existingMember;
        }

        const [inserted] = await tx
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
              ? [{ url: referrer.trim(), timestamp: new Date().toISOString() }]
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

        if (inserted) {
          return inserted;
        }

        const [loaded] = await tx
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
          .limit(1);

        if (!loaded) {
          throw new Error('Unable to resolve audience member');
        }

        return loaded;
      })();

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
        { status: 500 }
      );
    }

    // Increment social link click count if applicable
    if (linkType === 'social' && linkId) {
      try {
        await db
          .update(socialLinks)
          .set({
            clicks: drizzleSql`${socialLinks.clicks} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(socialLinks.id, linkId));
      } catch {
        // Ignore failures (often blocked by RLS for public requests)
      }
    }

    return NextResponse.json({ success: true, id: clickEvent.id });
  } catch (error) {
    await captureError('Track API error', error, {
      route: '/api/track',
      method: 'POST',
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
