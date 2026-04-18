import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import type { AudienceSourceType } from '@/lib/audience/activity-types';
import {
  resolveAudienceClickEventType,
  resolveAudienceClickObjectType,
  resolveAudienceClickVerb,
} from '@/lib/audience/click-event-helpers';
import { recordAudienceEvent } from '@/lib/audience/record-audience-event';
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
import { detectBot } from '@/lib/utils/bot-detection';
import { extractClientIP } from '@/lib/utils/ip-extraction';
import {
  createFingerprint,
  deriveIntentLevel,
  getActionWeight,
  mergeAudienceTags,
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

// Audience member select columns — shared between insert-returning and fallback select
const AUDIENCE_MEMBER_COLUMNS = {
  id: audienceMembers.id,
  visits: audienceMembers.visits,
  engagementScore: audienceMembers.engagementScore,
  latestActions: audienceMembers.latestActions,
  geoCity: audienceMembers.geoCity,
  geoCountry: audienceMembers.geoCountry,
  deviceType: audienceMembers.deviceType,
  spotifyConnected: audienceMembers.spotifyConnected,
  attributionSource: audienceMembers.attributionSource,
  tags: audienceMembers.tags,
} as const;

async function upsertAudienceMember(
  tx: Parameters<Parameters<typeof withSystemIngestionSession>[0]>[0],
  opts: {
    profileId: string;
    fingerprint: string;
    audienceDeviceType: 'mobile' | 'desktop' | 'tablet' | 'unknown';
    referrer: string | undefined;
    geoCity: string | undefined;
    geoCountry: string | undefined;
    utmParams: Record<string, string> | null | undefined;
    linkType: string;
    target: string;
    isBot: boolean;
  }
): Promise<string> {
  const attribution = deriveAttributionSource(opts.utmParams);
  const audienceTags = opts.isBot ? ['bot'] : [];

  const [insertedMember] = await tx
    .insert(audienceMembers)
    .values({
      creatorProfileId: opts.profileId,
      fingerprint: opts.fingerprint,
      type: 'anonymous',
      displayName: 'Visitor',
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      visits: 0,
      engagementScore: 0,
      intentLevel: 'low',
      deviceType: opts.audienceDeviceType,
      referrerHistory: opts.referrer
        ? [{ url: opts.referrer.trim(), timestamp: new Date().toISOString() }]
        : [],
      latestActions: [],
      geoCity: opts.geoCity ?? null,
      geoCountry: opts.geoCountry ?? null,
      tags: audienceTags,
      ...(attribution ? { attributionSource: attribution } : {}),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing({
      target: [audienceMembers.creatorProfileId, audienceMembers.fingerprint],
    })
    .returning(AUDIENCE_MEMBER_COLUMNS);

  const resolvedMember =
    insertedMember ??
    (
      await tx
        .select(AUDIENCE_MEMBER_COLUMNS)
        .from(audienceMembers)
        .where(
          and(
            eq(audienceMembers.creatorProfileId, opts.profileId),
            eq(audienceMembers.fingerprint, opts.fingerprint)
          )
        )
        .limit(1)
    )?.[0];

  if (!resolvedMember) {
    throw new Error('Unable to resolve audience member');
  }

  const now = new Date();
  const existingActionCount = Array.isArray(resolvedMember.latestActions)
    ? resolvedMember.latestActions.length
    : 0;
  const actionCount = Math.min(existingActionCount + 1, 5);
  const weight = getActionWeight(opts.linkType);
  const tags = mergeAudienceTags(resolvedMember.tags, audienceTags);
  const isBotMember = tags.includes('bot');
  const updatedScore = isBotMember
    ? (resolvedMember.engagementScore ?? 0)
    : (resolvedMember.engagementScore ?? 0) + weight;
  const intentLevel = isBotMember
    ? 'low'
    : deriveIntentLevel(resolvedMember.visits ?? 0, actionCount);

  await tx
    .update(audienceMembers)
    .set({
      lastSeenAt: now,
      updatedAt: now,
      engagementScore: updatedScore,
      intentLevel,
      deviceType: opts.audienceDeviceType,
      geoCity: opts.geoCity ?? resolvedMember.geoCity ?? null,
      geoCountry: opts.geoCountry ?? resolvedMember.geoCountry ?? null,
      tags,
      spotifyConnected:
        Boolean(resolvedMember.spotifyConnected) || opts.linkType === 'listen',
      ...(attribution && !resolvedMember.attributionSource
        ? { attributionSource: attribution }
        : {}),
    })
    .where(eq(audienceMembers.id, resolvedMember.id));

  return resolvedMember.id;
}

function getRawTipAmount(
  context: Record<string, unknown> | undefined
): number | undefined {
  if (typeof context?.tipAmountCents === 'number')
    return context.tipAmountCents;
  if (typeof context?.tipAmount === 'number')
    return Math.round(context.tipAmount * 100);
  return undefined;
}

function buildClickMetadata(
  target: string,
  resolvedSource: string | undefined,
  context: Record<string, unknown> | undefined,
  utmParams: Record<string, string> | null | undefined,
  linkType: string
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    target,
    ...(resolvedSource ? { source: resolvedSource } : {}),
    ...(context?.contentType ? { contentType: context.contentType } : {}),
    ...(context?.contentId ? { contentId: context.contentId } : {}),
    ...(context?.provider ? { provider: context.provider } : {}),
    ...(context?.smartLinkSlug ? { smartLinkSlug: context.smartLinkSlug } : {}),
  };
  if (utmParams) {
    metadata.utmParams = utmParams;
  }
  const rawTipAmount = getRawTipAmount(context);
  if (
    linkType === 'tip' &&
    typeof rawTipAmount === 'number' &&
    rawTipAmount > 0
  ) {
    metadata.tipAmountCents = rawTipAmount;
  }
  return metadata;
}

function resolveTrackSourceKind(
  resolvedSource: string | undefined
): AudienceSourceType | null {
  if (resolvedSource === 'qr') return 'qr';
  if (resolvedSource === 'short_link') return 'short_link';
  if (resolvedSource === 'utm') return 'utm';
  if (resolvedSource === 'referrer') return 'referrer';
  if (resolvedSource === 'social') return 'social';
  if (resolvedSource === 'email') return 'email';
  if (resolvedSource === 'sms') return 'sms';
  if (resolvedSource === 'direct') return 'direct';
  if (resolvedSource === 'unknown') return 'unknown';
  return null;
}

function formatTrackSourceLabel(source: string): string {
  return source
    .split(/[_-]+/)
    .filter(Boolean)
    .map(segment =>
      segment.length <= 3
        ? segment.toUpperCase()
        : `${segment[0]?.toUpperCase() ?? ''}${segment.slice(1)}`
    )
    .join(' ');
}

function resolveTrackSourceLabel(
  resolvedSource: string | undefined
): string | undefined {
  if (!resolvedSource) return undefined;
  if (resolvedSource === 'qr') return 'QR Code';
  if (resolvedSource === 'short_link') return 'Short Link';
  if (resolvedSource === 'utm') return 'UTM Campaign';
  if (resolvedSource === 'preferred_dsp') return 'Preferred DSP';
  if (resolvedSource === 'sounds') return 'Sounds Page';
  if (resolvedSource === 'link') return 'Short Link';
  if (resolvedSource === 'redirect') return 'Redirect';
  return formatTrackSourceLabel(resolvedSource);
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

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
    const botDetection = detectBot(request, '/api/track');
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

    const trackingResult = await withSystemIngestionSession(async tx => {
      // Only create/update audience member records when marketing consent is given
      const audienceMemberId = hasMarketingConsent
        ? await upsertAudienceMember(tx, {
            profileId: profile.id,
            fingerprint,
            audienceDeviceType,
            referrer,
            geoCity,
            geoCountry,
            utmParams,
            linkType,
            target,
            isBot: botDetection.isBot,
          })
        : null;

      const metadata = buildClickMetadata(
        target,
        resolvedSource,
        context as Record<string, unknown> | undefined,
        utmParams,
        linkType
      );

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
          isBot: botDetection.isBot,
          metadata,
          audienceMemberId,
        })
        .returning({ id: clickEvents.id });

      if (insertedClickEvent && audienceMemberId) {
        await recordAudienceEvent(tx, {
          creatorProfileId: profile.id,
          audienceMemberId,
          eventType: resolveAudienceClickEventType(linkType, context),
          verb: resolveAudienceClickVerb(linkType),
          confidence: 'observed',
          sourceKind: resolveTrackSourceKind(resolvedSource),
          sourceLabel: resolveTrackSourceLabel(resolvedSource),
          objectType: resolveAudienceClickObjectType(linkType, context),
          objectId: context?.contentId ?? linkId ?? null,
          objectLabel: context?.smartLinkSlug ?? target,
          clickEventId: insertedClickEvent.id,
          platform: context?.provider ?? target,
          properties: metadata,
        });
      }

      return { clickEvent: insertedClickEvent, audienceMemberId };
    });

    if (!trackingResult.clickEvent) {
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
      { success: true, id: trackingResult.clickEvent.id },
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
