import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audienceMembers, clickEvents } from '@/lib/db/schema/analytics';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import {
  createRateLimitHeaders,
  trackingIpClicksLimiter,
} from '@/lib/rate-limit';
import { detectPlatformFromUA } from '@/lib/utils';
import { extractClientIP } from '@/lib/utils/ip-extraction';
import {
  createFingerprint,
  deriveIntentLevel,
  getActionWeight,
  trimHistory,
} from '../audience/lib/audience-utils';
import { validateTrackRequest } from './validation';

// ---------------------------------------------------------------------------
// Consent helpers
// ---------------------------------------------------------------------------

const CONSENT_COOKIE_NAME = 'jv_cc';

interface ConsentPreferences {
  essential: boolean;
  analytics: boolean;
  marketing: boolean;
}

function parseConsentCookie(request: NextRequest): ConsentPreferences | null {
  try {
    const raw = request.cookies?.get(CONSENT_COOKIE_NAME)?.value;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentPreferences;
    if (typeof parsed?.marketing !== 'boolean') return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Anonymize an IP address for privacy:
 * - IPv4: zero last octet (e.g. "1.2.3.4" → "1.2.3.0")
 * - IPv6: truncate last 80 bits (zero last 5 groups)
 */
function anonymizeIp(ip: string): string {
  if (ip.includes(':')) {
    // IPv6: split on '::' once, expand the gap to fill 8 groups, zero last 5
    const [left, right = ''] = ip.split('::');
    const leftParts = left ? left.split(':') : [];
    const rightParts = right ? right.split(':') : [];
    const missing = 8 - leftParts.length - rightParts.length;
    const full = [
      ...leftParts,
      ...new Array(Math.max(0, missing)).fill('0000'),
      ...rightParts,
    ];
    return full.slice(0, 3).concat(['0', '0', '0', '0', '0']).join(':');
  }
  // IPv4: zero last octet
  const parts = ip.split('.');
  if (parts.length === 4) {
    parts[3] = '0';
    return parts.join('.');
  }
  return '0.0.0.0';
}

// API routes should be dynamic
export const dynamic = 'force-dynamic';

export const runtime = 'nodejs';

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

// ---------------------------------------------------------------------------
// Attribution helpers
// ---------------------------------------------------------------------------

/**
 * Derive retargeting attribution source from UTM params.
 * Returns null when UTM params don't match a known retargeting pattern.
 */
function deriveAttributionSource(
  utmParams: { utm_source?: string; utm_medium?: string } | null | undefined
): string | null {
  if (!utmParams?.utm_source || utmParams.utm_medium !== 'retargeting')
    return null;
  const src = utmParams.utm_source.toLowerCase();
  if (src === 'meta' || src === 'facebook') return 'retargeting_meta';
  if (src === 'google') return 'retargeting_google';
  if (src === 'tiktok') return 'retargeting_tiktok';
  return null;
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

function getRawTipAmount(
  context: Record<string, unknown> | undefined
): number | undefined {
  if (typeof context?.tipAmountCents === 'number')
    return context.tipAmountCents;
  if (typeof context?.tipAmount === 'number')
    return Math.round(context.tipAmount * 100);
  return undefined;
}

/** Upsert audience member and update engagement metrics. Returns the member ID. */
async function upsertAudienceMember(
  tx: Parameters<Parameters<typeof withSystemIngestionSession>[0]>[0],
  params: {
    profileId: string;
    fingerprint: string;
    audienceDeviceType: 'mobile' | 'desktop' | 'tablet' | 'unknown';
    referrer: string | undefined;
    geoCity: string | undefined;
    geoCountry: string | undefined;
    linkType: string;
    target: string;
    utmParams: { utm_source?: string; utm_medium?: string } | null | undefined;
  }
): Promise<string> {
  const attribution = deriveAttributionSource(params.utmParams);

  const [insertedMember] = await tx
    .insert(audienceMembers)
    .values({
      creatorProfileId: params.profileId,
      fingerprint: params.fingerprint,
      type: 'anonymous',
      displayName: 'Visitor',
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      visits: 0,
      engagementScore: 0,
      intentLevel: 'low',
      deviceType: params.audienceDeviceType,
      referrerHistory: params.referrer
        ? [{ url: params.referrer.trim(), timestamp: new Date().toISOString() }]
        : [],
      latestActions: [],
      geoCity: params.geoCity ?? null,
      geoCountry: params.geoCountry ?? null,
      ...(attribution ? { attributionSource: attribution } : {}),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing({
      target: [audienceMembers.creatorProfileId, audienceMembers.fingerprint],
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
      attributionSource: audienceMembers.attributionSource,
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
          attributionSource: audienceMembers.attributionSource,
        })
        .from(audienceMembers)
        .where(
          and(
            eq(audienceMembers.creatorProfileId, params.profileId),
            eq(audienceMembers.fingerprint, params.fingerprint)
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
    label: ACTION_LABELS[params.linkType] ?? 'interacted',
    type: params.linkType,
    platform: params.target,
    emoji: ACTION_ICONS[params.linkType] ?? '⭐',
    timestamp: now.toISOString(),
  };
  const latestActions = trimHistory([actionEntry, ...existingActions], 5);
  const actionCount = latestActions.length;
  const weight = getActionWeight(params.linkType);
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
      deviceType: params.audienceDeviceType,
      geoCity: params.geoCity ?? resolvedMember.geoCity ?? null,
      geoCountry: params.geoCountry ?? resolvedMember.geoCountry ?? null,
      spotifyConnected:
        Boolean(resolvedMember.spotifyConnected) ||
        params.linkType === 'listen',
      ...(attribution && !resolvedMember.attributionSource
        ? { attributionSource: attribution }
        : {}),
    })
    .where(eq(audienceMembers.id, resolvedMember.id));

  return resolvedMember.id;
}

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

    // Validate request using extracted validation module
    const validationResult = validateTrackRequest(body);
    if ('error' in validationResult) {
      return NextResponse.json(
        { error: validationResult.error.error },
        { status: validationResult.error.status, headers: NO_STORE_HEADERS }
      );
    }

    const {
      handle,
      linkType,
      target,
      linkId,
      source: resolvedSource,
      context,
      utmParams,
    } = validationResult.data;

    const userAgent = request.headers.get('user-agent');
    const platformDetected = detectPlatformFromUA(userAgent || undefined);
    // ipAddress already extracted above for rate limiting
    // Filter out self-referrals: the HTTP Referer header on same-origin fetch()
    // is the current page URL, not the external traffic source.
    const httpReferer = request.headers.get('referer') ?? undefined;
    const referrer =
      httpReferer && isSameOriginReferrer(httpReferer, request.url)
        ? undefined
        : httpReferer;
    const geoCity = request.headers.get('x-vercel-ip-city') ?? undefined;
    const geoCountry =
      request.headers.get('x-vercel-ip-country') ??
      request.headers.get('cf-ipcountry') ??
      undefined;
    const audienceDeviceType = inferAudienceDeviceType(userAgent);

    // Determine marketing consent from jv_cc cookie.
    // When the cookie banner is not shown (non-regulated jurisdictions),
    // jv_cc is absent — treat absent cookie as consent given (default-allow).
    // Only explicit marketing=false (user rejected) blocks audience tracking.
    const consent = parseConsentCookie(request);
    const hasMarketingConsent = consent === null || consent.marketing === true;

    // Without marketing consent: anonymize IP and use generic fingerprint.
    // With consent: full behavior (store real IP, create audience members).
    const effectiveIp = hasMarketingConsent
      ? ipAddress
      : anonymizeIp(ipAddress);
    const fingerprint = hasMarketingConsent
      ? createFingerprint(ipAddress, userAgent)
      : 'anonymous';

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
      // Only create/update audience member records when marketing consent is given
      const audienceMemberId = hasMarketingConsent
        ? await upsertAudienceMember(tx, {
            profileId: profile.id,
            fingerprint,
            audienceDeviceType,
            referrer,
            geoCity,
            geoCountry,
            linkType,
            target,
            utmParams,
          })
        : null;

      const metadata: Record<string, unknown> = {
        target,
        ...(resolvedSource ? { source: resolvedSource } : {}),
        ...(context?.contentType ? { contentType: context.contentType } : {}),
        ...(context?.contentId ? { contentId: context.contentId } : {}),
        ...(context?.provider ? { provider: context.provider } : {}),
        ...(context?.smartLinkSlug
          ? { smartLinkSlug: context.smartLinkSlug }
          : {}),
      };

      if (utmParams) {
        metadata.utmParams = utmParams;
      }

      const rawTipAmount = getRawTipAmount(
        context as Record<string, unknown> | undefined
      );

      if (
        linkType === 'tip' &&
        typeof rawTipAmount === 'number' &&
        rawTipAmount > 0
      ) {
        metadata.tipAmountCents = rawTipAmount;
      }

      // Always record the click event (preserves link click counts),
      // but use the anonymized IP when marketing consent is absent.
      const [insertedClickEvent] = await tx
        .insert(clickEvents)
        .values({
          creatorProfileId: profile.id,
          linkType: linkType as 'listen' | 'social' | 'tip' | 'other',
          linkId: linkId || null,
          ipAddress: effectiveIp,
          userAgent,
          referrer,
          country: geoCountry,
          city: geoCity,
          deviceType: platformDetected,
          metadata,
          audienceMemberId,
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
        .catch(error => {
          // Ensure error is always captured even if background task fails
          captureError('Failed to update social link click count', error, {
            route: '/api/track',
            creatorProfileId: profile.id,
            handle,
            linkId,
            linkType,
          }).catch(() => {});
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
