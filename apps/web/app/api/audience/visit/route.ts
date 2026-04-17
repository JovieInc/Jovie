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
import { isVisitorBlocked } from '@/lib/audience/block-check';
import { recordAudienceEvent } from '@/lib/audience/record-audience-event';
import { type DbOrTransaction, db, doesTableExist } from '@/lib/db';
import { unwrapPgError } from '@/lib/db/errors';
import {
  audienceMembers,
  audienceReferrers,
  dailyProfileViews,
} from '@/lib/db/schema/analytics';
import {
  creatorDistributionEvents,
  creatorProfiles,
} from '@/lib/db/schema/profiles';
import {
  buildDistributionDedupeKey,
  getBioLinkActivationWindowEnd,
  getInstagramReferrerHost,
  INSTAGRAM_DISTRIBUTION_PLATFORM,
  isInstagramActivationSource,
} from '@/lib/distribution/instagram-activation';
import { captureError, captureWarning } from '@/lib/error-tracking';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { publicVisitLimiter } from '@/lib/rate-limit';
import { detectBot } from '@/lib/utils/bot-detection';
import { extractClientIP } from '@/lib/utils/ip-extraction';
import { logger } from '@/lib/utils/logger';
import { visitSchema } from '@/lib/validation/schemas';
import {
  createFingerprint,
  deriveIntentLevel,
  mergeAudienceTags,
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

function resolveVisitSourceKind(
  utmParams: { source?: string } | undefined,
  referrer: string | null | undefined
) {
  if (utmParams?.source) return 'utm' as const;
  if (referrer) return 'referrer' as const;
  return 'direct' as const;
}

function resolveVisitSourceLabel(
  utmParams:
    | {
        source?: string;
        medium?: string;
        campaign?: string;
        content?: string;
      }
    | undefined,
  referrer: string | null | undefined
): string | null {
  if (utmParams?.source) {
    return utmParams.medium
      ? `${utmParams.source} / ${utmParams.medium}`
      : utmParams.source;
  }
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.replace('www.', '');
  } catch {
    return referrer;
  }
}

async function incrementDailyProfileViews(
  tx: DbOrTransaction,
  profileId: string,
  viewDate: string,
  now: Date
): Promise<void> {
  const values = {
    creatorProfileId: profileId,
    viewDate,
    viewCount: 1,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await tx
      .insert(dailyProfileViews)
      .values(values)
      .onConflictDoUpdate({
        target: [
          dailyProfileViews.creatorProfileId,
          dailyProfileViews.viewDate,
        ],
        set: {
          viewCount: drizzleSql`${dailyProfileViews.viewCount} + 1`,
          updatedAt: now,
        },
      });
    return;
  } catch (error) {
    const isMissingConflictTarget =
      error instanceof Error &&
      (error.message.includes('42P10') ||
        error.message.includes(
          'there is no unique or exclusion constraint matching the ON CONFLICT specification'
        ));

    if (!isMissingConflictTarget) {
      throw error;
    }

    logger.warn(
      '[Audience Visit] Missing conflict target for daily_profile_views upsert, using safe fallback update path'
    );
  }

  const [updatedExisting] = await tx
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

  if (updatedExisting) {
    return;
  }

  await tx.insert(dailyProfileViews).values(values).onConflictDoNothing();

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

function isMissingDailyProfileViewsTableError(error: unknown): boolean {
  return unwrapPgError(error).code === '42P01';
}

function isMissingCreatorDistributionEventsTableError(error: unknown): boolean {
  return unwrapPgError(error).code === '42P01';
}

function isMissingAudienceReferrersTableError(error: unknown): boolean {
  return unwrapPgError(error).code === '42P01';
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
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
    const botResult = detectBot(request, '/api/audience/visit', {
      userAgent: resolvedUserAgent,
    });
    const audienceTags = botResult.isBot ? ['bot'] : [];
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
    const rawGeoCity =
      geoCity ?? request.headers.get('x-vercel-ip-city') ?? undefined;
    const resolvedGeoCity = rawGeoCity
      ? decodeURIComponent(rawGeoCity)
      : undefined;
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
      .select({
        id: creatorProfiles.id,
        isPublic: creatorProfiles.isPublic,
        onboardingCompletedAt: creatorProfiles.onboardingCompletedAt,
      })
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

    // Block check: reject visits from blocked fingerprints
    const blocked = await isVisitorBlocked(profile.id, fingerprint);
    if (blocked) {
      return NextResponse.json(
        { status: 'blocked' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const normalizedDevice =
      deviceType ?? inferDeviceType(resolvedUserAgent ?? null);
    const now = new Date();
    const activationWindowEnd = getBioLinkActivationWindowEnd(
      profile.onboardingCompletedAt
    );
    const shouldTrackInstagramActivation =
      activationWindowEnd !== null &&
      now.getTime() <= activationWindowEnd.getTime() &&
      isInstagramActivationSource({
        referrer: resolvedReferrer,
        utmParams,
      });
    const referrerEntry = resolvedReferrer
      ? [{ url: resolvedReferrer.trim(), timestamp: now.toISOString() }]
      : [];

    try {
      const hasDailyProfileViewsTable = await doesTableExist(
        'daily_profile_views'
      );

      await withSystemIngestionSession(async tx => {
        const viewDate = now.toISOString().slice(0, 10);

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
            tags: audienceMembers.tags,
          })
          .from(audienceMembers)
          .where(
            and(
              eq(audienceMembers.creatorProfileId, profileId),
              eq(audienceMembers.fingerprint, fingerprint)
            )
          )
          .limit(1);

        const mergedTags = mergeAudienceTags(existing?.tags, audienceTags);
        const isBotAudienceMember = mergedTags.includes('bot');
        const updatedVisits = isBotAudienceMember
          ? (existing?.visits ?? 0)
          : (existing?.visits ?? 0) + 1;
        const actionCount = Array.isArray(existing?.latestActions)
          ? existing.latestActions.length
          : 0;
        const updatedIntent = isBotAudienceMember
          ? 'low'
          : deriveIntentLevel(updatedVisits, actionCount);
        const updatedScore = isBotAudienceMember
          ? (existing?.engagementScore ?? 0)
          : (existing?.engagementScore ?? 0) + 1;
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
        const instagramReferrerHost =
          getInstagramReferrerHost(resolvedReferrer);
        if (hasDailyProfileViewsTable && !isBotAudienceMember) {
          try {
            await incrementDailyProfileViews(tx, profileId, viewDate, now);
          } catch (error) {
            if (!isMissingDailyProfileViewsTableError(error)) {
              throw error;
            }

            await captureWarning(
              '[audience/visit] daily_profile_views table missing; skipping aggregate write',
              error,
              { profileId, viewDate }
            );
          }
        }

        if (shouldTrackInstagramActivation && !isBotAudienceMember) {
          try {
            await tx
              .insert(creatorDistributionEvents)
              .values({
                createdAt: now,
                creatorProfileId: profileId,
                dedupeKey: buildDistributionDedupeKey(
                  profileId,
                  INSTAGRAM_DISTRIBUTION_PLATFORM,
                  'activated'
                ),
                eventType: 'activated',
                metadata: {
                  referrerHost: instagramReferrerHost,
                  surface: 'onboarding',
                  utmContent: utmParams?.content ?? null,
                  utmMedium: utmParams?.medium ?? null,
                  utmSource: utmParams?.source ?? null,
                },
                platform: INSTAGRAM_DISTRIBUTION_PLATFORM,
              })
              .onConflictDoNothing();
          } catch (error) {
            if (!isMissingCreatorDistributionEventsTableError(error)) {
              throw error;
            }

            await captureWarning(
              '[audience/visit] creator_distribution_events table missing; skipping activation write',
              error,
              { profileId }
            );
          }
        }

        // Summary column value for fast list views
        const latestReferrerUrl = resolvedReferrer?.trim() ?? null;

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
              tags: mergedTags,
              ...(latestReferrerUrl && { latestReferrerUrl }),
              ...(utmParams && { utmParams: resolvedUtmParams }),
            })
            .where(eq(audienceMembers.id, existing.id));

          // Dual-write: insert into normalized referrer table
          if (latestReferrerUrl) {
            try {
              const referrerSource = (() => {
                try {
                  return new URL(latestReferrerUrl).hostname;
                } catch {
                  return null;
                }
              })();
              await tx.insert(audienceReferrers).values({
                audienceMemberId: existing.id,
                url: latestReferrerUrl,
                source: referrerSource,
                timestamp: now,
              });
            } catch (error) {
              if (!isMissingAudienceReferrersTableError(error)) {
                throw error;
              }
            }
          }
          await recordAudienceEvent(tx, {
            creatorProfileId: profileId,
            audienceMemberId: existing.id,
            eventType: 'profile_visited',
            verb: 'visited',
            confidence: 'observed',
            sourceKind: resolveVisitSourceKind(utmParams, latestReferrerUrl),
            sourceLabel: resolveVisitSourceLabel(utmParams, latestReferrerUrl),
            objectType: 'profile',
            objectId: profileId,
            objectLabel: 'Profile',
            properties: {
              referrer: latestReferrerUrl,
              utmParams: resolvedUtmParams,
            },
            timestamp: now,
          });
          return;
        }

        const [inserted] = await tx
          .insert(audienceMembers)
          .values({
            creatorProfileId: profileId,
            fingerprint,
            type: 'anonymous',
            displayName: 'Visitor',
            firstSeenAt: now,
            lastSeenAt: now,
            visits: updatedVisits,
            engagementScore: updatedScore,
            intentLevel: updatedIntent,
            geoCity: geoCityValue,
            geoCountry: geoCountryValue,
            deviceType: normalizedDevice,
            referrerHistory,
            utmParams: resolvedUtmParams,
            tags: mergedTags,
            latestActions: [],
            latestReferrerUrl,
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

        // Dual-write: insert first referrer for new members
        if (inserted && latestReferrerUrl) {
          try {
            const referrerSource = (() => {
              try {
                return new URL(latestReferrerUrl).hostname;
              } catch {
                return null;
              }
            })();
            await tx.insert(audienceReferrers).values({
              audienceMemberId: inserted.id,
              url: latestReferrerUrl,
              source: referrerSource,
              timestamp: now,
            });
          } catch (error) {
            if (!isMissingAudienceReferrersTableError(error)) {
              throw error;
            }
          }
        }
        if (inserted) {
          await recordAudienceEvent(tx, {
            creatorProfileId: profileId,
            audienceMemberId: inserted.id,
            eventType: 'profile_visited',
            verb: 'visited',
            confidence: 'observed',
            sourceKind: resolveVisitSourceKind(utmParams, latestReferrerUrl),
            sourceLabel: resolveVisitSourceLabel(utmParams, latestReferrerUrl),
            objectType: 'profile',
            objectId: profileId,
            objectLabel: 'Profile',
            properties: {
              referrer: latestReferrerUrl,
              utmParams: resolvedUtmParams,
            },
            timestamp: now,
          });
        }
      });

      return NextResponse.json(
        { success: true, fingerprint },
        { headers: NO_STORE_HEADERS }
      );
    } catch (error) {
      logger.error('[Audience Visit] Optional persistence degraded', {
        error,
        fingerprint,
        profileId,
      });
      await captureError('Audience visit persistence degraded', error, {
        route: '/api/audience/visit',
        method: 'POST',
        fingerprint,
        profileId,
      });
      return NextResponse.json(
        { success: true, fingerprint, degraded: true },
        { headers: NO_STORE_HEADERS }
      );
    }
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
