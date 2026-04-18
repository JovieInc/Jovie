import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import {
  createFingerprint,
  mergeAudienceTags,
} from '@/app/api/audience/lib/audience-utils';
import { recordAudienceEvent } from '@/lib/audience/record-audience-event';
import { appendSourceUtmParams } from '@/lib/audience/source-links';
import { db } from '@/lib/db';
import {
  audienceMembers,
  audienceSourceLinks,
} from '@/lib/db/schema/analytics';
import { captureError } from '@/lib/error-tracking';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { publicClickLimiter } from '@/lib/rate-limit';
import { detectBot } from '@/lib/utils/bot-detection';
import { extractClientIP } from '@/lib/utils/ip-extraction';
import { validateSocialLinkUrl } from '@/lib/utils/url-validation';

export const runtime = 'nodejs';

const CONSENT_COOKIE_NAME = 'jv_cc';

interface ConsentPreferences {
  readonly essential: boolean;
  readonly analytics: boolean;
  readonly marketing: boolean;
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

function isSafeRedirectDestination(url: string): boolean {
  const validation = validateSocialLinkUrl(url);
  if (!validation.valid) {
    return false;
  }

  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    return !url.toLowerCase().includes('javascript:');
  } catch {
    return false;
  }
}

function resolveObjectType(
  destinationKind: string | null
): 'tour_date' | 'release' | 'profile' | 'external_url' {
  switch (destinationKind) {
    case 'tour_date':
      return 'tour_date';
    case 'release':
      return 'release';
    case 'profile':
      return 'profile';
    default:
      return 'external_url';
  }
}

async function resolveAudienceMemberId(
  tx: Parameters<Parameters<typeof withSystemIngestionSession>[0]>[0],
  input: {
    readonly creatorProfileId: string;
    readonly fingerprint: string;
    readonly isBot: boolean;
    readonly userAgent: string | null;
    readonly geoCity: string | null;
    readonly geoCountry: string | null;
  }
): Promise<string> {
  const now = new Date();
  const tags = input.isBot ? ['bot'] : [];
  const [inserted] = await tx
    .insert(audienceMembers)
    .values({
      creatorProfileId: input.creatorProfileId,
      fingerprint: input.fingerprint,
      type: 'anonymous',
      displayName: 'Visitor',
      firstSeenAt: now,
      lastSeenAt: now,
      visits: input.isBot ? 0 : 1,
      engagementScore: input.isBot ? 0 : 1,
      intentLevel: 'low',
      geoCity: input.geoCity,
      geoCountry: input.geoCountry,
      deviceType: inferDeviceType(input.userAgent),
      referrerHistory: [],
      latestActions: [],
      tags,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [audienceMembers.creatorProfileId, audienceMembers.fingerprint],
    })
    .returning({
      id: audienceMembers.id,
      tags: audienceMembers.tags,
      visits: audienceMembers.visits,
      engagementScore: audienceMembers.engagementScore,
    });

  if (inserted) return inserted.id;

  const [existing] = await tx
    .select({
      id: audienceMembers.id,
      tags: audienceMembers.tags,
      visits: audienceMembers.visits,
      engagementScore: audienceMembers.engagementScore,
    })
    .from(audienceMembers)
    .where(
      and(
        eq(audienceMembers.creatorProfileId, input.creatorProfileId),
        eq(audienceMembers.fingerprint, input.fingerprint)
      )
    )
    .limit(1);

  if (!existing) {
    throw new Error('Unable to resolve audience member for source scan');
  }

  const mergedTags = mergeAudienceTags(existing.tags, tags);
  const isBotMember = mergedTags.includes('bot');
  await tx
    .update(audienceMembers)
    .set({
      lastSeenAt: now,
      updatedAt: now,
      visits: isBotMember ? existing.visits : existing.visits + 1,
      engagementScore: isBotMember
        ? existing.engagementScore
        : existing.engagementScore + 1,
      geoCity: input.geoCity,
      geoCountry: input.geoCountry,
      deviceType: inferDeviceType(input.userAgent),
      tags: mergedTags,
    })
    .where(eq(audienceMembers.id, existing.id));

  return existing.id;
}

export async function GET(
  request: NextRequest,
  { params }: { readonly params: Promise<{ readonly code: string }> }
) {
  const { code } = await params;
  try {
    const [sourceLink] = await db
      .select()
      .from(audienceSourceLinks)
      .where(eq(audienceSourceLinks.code, code))
      .limit(1);

    if (!sourceLink || sourceLink.archivedAt) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (!isSafeRedirectDestination(sourceLink.destinationUrl)) {
      throw new Error('Unsafe source link destination URL');
    }

    const destinationUrl = appendSourceUtmParams(
      sourceLink.destinationUrl,
      sourceLink.utmParams
    );
    const clientIP = extractClientIP(request.headers);
    const rateLimitResult = await publicClickLimiter.limit(clientIP);
    if (!rateLimitResult.success) {
      return NextResponse.redirect(destinationUrl, { status: 302 });
    }

    const userAgent = request.headers.get('user-agent');
    const botDetection = detectBot(request, '/s/[code]');
    const consent = parseConsentCookie(request);
    // Match /api/track semantics: absence of jv_cc means default-allow unless the
    // visitor explicitly rejected marketing cookies.
    const hasMarketingConsent = consent === null || consent.marketing === true;
    const geoCity = request.headers.get('x-vercel-ip-city');
    const geoCountry =
      request.headers.get('x-vercel-ip-country') ??
      request.headers.get('cf-ipcountry');

    try {
      await withSystemIngestionSession(async tx => {
        await tx
          .update(audienceSourceLinks)
          .set({
            scanCount: drizzleSql`${audienceSourceLinks.scanCount} + 1`,
            lastScannedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(audienceSourceLinks.id, sourceLink.id));

        if (!hasMarketingConsent) return;

        const audienceMemberId = await resolveAudienceMemberId(tx, {
          creatorProfileId: sourceLink.creatorProfileId,
          fingerprint: createFingerprint(clientIP, userAgent),
          isBot: botDetection.isBot,
          userAgent,
          geoCity,
          geoCountry,
        });

        await recordAudienceEvent(tx, {
          creatorProfileId: sourceLink.creatorProfileId,
          audienceMemberId,
          eventType: 'source_scanned',
          verb: 'scanned',
          confidence: 'observed',
          sourceKind: sourceLink.sourceType === 'qr' ? 'qr' : 'short_link',
          sourceLabel: sourceLink.name,
          sourceLinkId: sourceLink.id,
          objectType: resolveObjectType(sourceLink.destinationKind),
          objectId: sourceLink.destinationId,
          objectLabel:
            typeof sourceLink.metadata?.objectLabel === 'string'
              ? sourceLink.metadata.objectLabel
              : null,
          properties: {
            code: sourceLink.code,
            destinationUrl,
            utmParams: sourceLink.utmParams,
          },
        });
      });
    } catch (analyticsError) {
      await captureError('Source link analytics failed', analyticsError, {
        route: '/s/[code]',
        code,
        sourceLinkId: sourceLink.id,
      }).catch(() => undefined);
    }

    return NextResponse.redirect(destinationUrl, { status: 302 });
  } catch (error) {
    await captureError('Source link redirect failed', error, {
      route: '/s/[code]',
      code,
    });
    return NextResponse.json({ error: 'Unable to redirect' }, { status: 500 });
  }
}
