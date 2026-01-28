import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { creatorProfiles, pixelEvents } from '@/lib/db/schema';
import { incrementProfileViews } from '@/lib/services/profile';
import { detectBot } from '@/lib/utils/bot-detection';
import { extractClientIP } from '@/lib/utils/ip-extraction';
import { logger } from '@/lib/utils/logger';
import {
  checkPublicRateLimit,
  getPublicRateLimitStatus,
} from '@/lib/utils/rate-limit';
import { pixelEventPayloadSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Hash an IP address for privacy-preserving storage
 * We store the hash, not the raw IP
 */
function hashIP(ip: string): string {
  return crypto.createHash('sha256').update(`jovie-px:${ip}`).digest('hex');
}

/**
 * POST /api/px
 *
 * Lightweight pixel event ingestion endpoint.
 * Events are stored and queued for server-side forwarding to:
 * 1. Jovie's own marketing pixels
 * 2. Creator's configured pixels (Facebook CAPI, Google MP, TikTok Events API)
 */
export async function POST(request: NextRequest) {
  try {
    // Extract client IP for rate limiting and hashing
    const clientIP = extractClientIP(request.headers);

    // Public rate limiting check (per-IP) - use 'visit' limiter for pixel events
    if (checkPublicRateLimit(clientIP, 'visit')) {
      const status = getPublicRateLimitStatus(clientIP, 'visit');
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        {
          status: 429,
          headers: {
            ...NO_STORE_HEADERS,
            'Retry-After': String(status.retryAfterSeconds),
          },
        }
      );
    }

    // Bot detection - silently skip recording for bots
    const botResult = detectBot(request, '/api/px');
    if (botResult.isBot) {
      // Return success but don't record - prevents metric inflation
      return NextResponse.json(
        { success: true, filtered: true },
        { headers: NO_STORE_HEADERS }
      );
    }

    // Parse request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Validate payload
    const parsed = pixelEventPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const {
      profileId,
      sessionId,
      eventType,
      eventData,
      consent,
      referrer,
      pageUrl,
    } = parsed.data;

    // Validate profile exists and is public
    const [profile] = await db
      .select({
        id: creatorProfiles.id,
        isPublic: creatorProfiles.isPublic,
        usernameNormalized: creatorProfiles.usernameNormalized,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, profileId))
      .limit(1);

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    if (!profile.isPublic) {
      return NextResponse.json(
        { error: 'Profile is not public' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    // Get user agent
    const userAgent = request.headers.get('user-agent') || undefined;

    // Store both raw IP (for ad platform forwarding) and hash (for analytics)
    // Raw IP is required by Facebook CAPI and TikTok Events API for user matching
    const ipHash = hashIP(clientIP);

    // Build event data with UTM params and referrer
    const enrichedEventData = {
      ...eventData,
      referrer,
      pageUrl,
      utmSource: eventData?.utm_source,
      utmMedium: eventData?.utm_medium,
      utmCampaign: eventData?.utm_campaign,
      utmTerm: eventData?.utm_term,
      utmContent: eventData?.utm_content,
    };

    // Insert pixel event
    await db.insert(pixelEvents).values({
      profileId,
      sessionId,
      eventType,
      eventData: enrichedEventData,
      consentGiven: consent,
      clientIp: clientIP, // Raw IP for ad platform forwarding (Facebook CAPI, TikTok Events API)
      ipHash, // Hashed IP for analytics
      userAgent,
      forwardingStatus: {},
      forwardAt: new Date(),
    });

    if (eventType === 'page_view') {
      incrementProfileViews(profile.usernameNormalized).catch(() => {
        // Fail silently - pixel ingestion must not depend on view counting
      });
    }

    // Return success
    // The forwarding happens asynchronously via cron job
    return NextResponse.json({ success: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    logger.error('[Pixel] Error recording event', error);
    return NextResponse.json(
      { error: 'Failed to record event' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * OPTIONS - CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}
