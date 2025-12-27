import * as Sentry from '@sentry/nextjs';
import { and, eq, gt, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withDbSession, withDbSessionTx } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  creatorProfiles,
  dashboardIdempotencyKeys,
  socialLinks,
  users,
} from '@/lib/db/schema';
import { captureError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { computeLinkConfidence } from '@/lib/ingestion/confidence';
import {
  enqueueBeaconsIngestionJob,
  enqueueLayloIngestionJob,
  enqueueLinktreeIngestionJob,
  enqueueYouTubeIngestionJob,
} from '@/lib/ingestion/jobs';
import { maybeSetProfileAvatarFromLinks } from '@/lib/ingestion/magic-profile-avatar';
import {
  isBeaconsUrl,
  validateBeaconsUrl,
} from '@/lib/ingestion/strategies/beacons';
import { isLayloUrl } from '@/lib/ingestion/strategies/laylo';
import { isLinktreeUrl } from '@/lib/ingestion/strategies/linktree';
import { validateYouTubeChannelUrl } from '@/lib/ingestion/strategies/youtube';
import {
  createRateLimitHeaders,
  dashboardLinksRateLimit,
} from '@/lib/rate-limit';
import { validateLink } from '@/lib/utils/platform-detection';
import { validateSocialLinkUrl } from '@/lib/utils/url-validation';
import { isValidSocialPlatform } from '@/types';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Idempotency key expiration time (24 hours).
 * This duration balances between:
 * - Long enough to catch retries from network failures and user refreshes
 * - Short enough to not consume excessive storage
 *
 * NOTE: Expired keys should be cleaned up periodically via a background job
 * or Postgres TTL extension (pg_cron). See dashboard_idempotency_keys table.
 */
const IDEMPOTENCY_KEY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Check and apply rate limiting for dashboard link operations.
 *
 * Rate limiting is applied per-user (via clerkUserId) rather than per-profile.
 * This means a user with multiple profiles shares the same rate limit bucket
 * across all their profiles (30 requests per minute total).
 *
 * Rationale: Per-user limiting is simpler and prevents abuse where a malicious
 * user creates many profiles to bypass per-profile limits.
 */
async function checkRateLimit(
  userId: string
): Promise<{ allowed: boolean; headers: HeadersInit }> {
  if (!dashboardLinksRateLimit) {
    // Rate limiting not configured, allow request
    return { allowed: true, headers: {} };
  }

  const result = await dashboardLinksRateLimit.limit(userId);
  const headers = createRateLimitHeaders({
    success: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: new Date(result.reset),
  });

  return { allowed: result.success, headers };
}

/**
 * Check for existing idempotency key and return cached response if found
 */
async function checkIdempotencyKey(
  key: string,
  userId: string,
  endpoint: string
): Promise<{ cached: boolean; response?: NextResponse }> {
  if (!key) {
    return { cached: false };
  }

  const [existing] = await db
    .select({
      responseStatus: dashboardIdempotencyKeys.responseStatus,
      responseBody: dashboardIdempotencyKeys.responseBody,
      expiresAt: dashboardIdempotencyKeys.expiresAt,
    })
    .from(dashboardIdempotencyKeys)
    .where(
      and(
        eq(dashboardIdempotencyKeys.key, key),
        eq(dashboardIdempotencyKeys.userId, userId),
        eq(dashboardIdempotencyKeys.endpoint, endpoint),
        gt(dashboardIdempotencyKeys.expiresAt, new Date())
      )
    )
    .limit(1);

  if (existing) {
    return {
      cached: true,
      response: NextResponse.json(existing.responseBody ?? { ok: true }, {
        status: existing.responseStatus,
        headers: NO_STORE_HEADERS,
      }),
    };
  }

  return { cached: false };
}

/**
 * Store idempotency key with response for future deduplication
 */
async function storeIdempotencyKey(
  key: string,
  userId: string,
  endpoint: string,
  responseStatus: number,
  responseBody: Record<string, unknown>
): Promise<void> {
  if (!key) return;

  try {
    await db
      .insert(dashboardIdempotencyKeys)
      .values({
        key,
        userId,
        endpoint,
        responseStatus,
        responseBody,
        expiresAt: new Date(Date.now() + IDEMPOTENCY_KEY_TTL_MS),
      })
      .onConflictDoNothing();
  } catch {
    // Non-critical: idempotency key storage failure shouldn't fail the request
    console.error('Failed to store idempotency key');
  }
}

export async function GET(req: Request) {
  try {
    return await withDbSession(async clerkUserId => {
      const url = new URL(req.url);
      const profileId = url.searchParams.get('profileId');
      if (!profileId) {
        return NextResponse.json(
          { error: 'Profile ID is required' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      // Verify the profile belongs to the authenticated user before checking cache
      const [profile] = await db
        .select({
          id: creatorProfiles.id,
          usernameNormalized: creatorProfiles.usernameNormalized,
        })
        .from(creatorProfiles)
        .innerJoin(users, eq(users.id, creatorProfiles.userId))
        .where(
          and(eq(creatorProfiles.id, profileId), eq(users.clerkId, clerkUserId))
        )
        .limit(1);
      if (!profile) {
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      const rows = await db
        .select({
          profileId: creatorProfiles.id,
          linkId: socialLinks.id,
          platform: socialLinks.platform,
          platformType: socialLinks.platformType,
          url: socialLinks.url,
          sortOrder: socialLinks.sortOrder,
          isActive: socialLinks.isActive,
          displayText: socialLinks.displayText,
          state: socialLinks.state,
          confidence: socialLinks.confidence,
          sourcePlatform: socialLinks.sourcePlatform,
          sourceType: socialLinks.sourceType,
          evidence: socialLinks.evidence,
          version: socialLinks.version,
        })
        .from(creatorProfiles)
        .innerJoin(users, eq(users.id, creatorProfiles.userId))
        .leftJoin(
          socialLinks,
          eq(socialLinks.creatorProfileId, creatorProfiles.id)
        )
        .where(
          and(eq(creatorProfiles.id, profileId), eq(users.clerkId, clerkUserId))
        )
        .orderBy(socialLinks.sortOrder);

      if (rows.length === 0) {
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      const links = rows
        .filter(r => r.linkId !== null)
        .map(r => {
          const state =
            (r.state as 'active' | 'suggested' | 'rejected' | null) ??
            (r.isActive ? 'active' : 'suggested');
          if (state === 'rejected') return null;

          const parsedConfidence =
            typeof r.confidence === 'number'
              ? r.confidence
              : Number.parseFloat(String(r.confidence ?? '0'));
          return {
            id: r.linkId!,
            platform: r.platform!,
            platformType: r.platformType!,
            url: r.url!,
            sortOrder: r.sortOrder!,
            isActive: state === 'active',
            displayText: r.displayText,
            state,
            confidence: Number.isFinite(parsedConfidence)
              ? parsedConfidence
              : 0,
            sourcePlatform: r.sourcePlatform,
            sourceType: r.sourceType ?? 'manual',
            evidence: r.evidence,
            version: r.version ?? 1,
          };
        })
        .filter((link): link is NonNullable<typeof link> => Boolean(link));

      return NextResponse.json(
        { links },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    });
  } catch (error) {
    console.error('Error fetching social links:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

const updateSocialLinksSchema = z.object({
  profileId: z.string().min(1),
  idempotencyKey: z.string().max(128).optional(),
  expectedVersion: z.number().int().min(1).optional(),
  links: z
    .array(
      z.object({
        platform: z
          .string()
          .min(1)
          .refine(isValidSocialPlatform, { message: 'Invalid platform' }),
        platformType: z.string().min(1).optional(),
        url: z.string().min(1).max(2048),
        sortOrder: z.number().int().min(0).optional(),
        isActive: z.boolean().optional(),
        displayText: z.string().max(256).optional(),
        state: z.enum(['active', 'suggested', 'rejected']).optional(),
        confidence: z.number().min(0).max(1).optional(),
        sourcePlatform: z.string().max(128).optional(),
        sourceType: z.enum(['manual', 'admin', 'ingested']).optional(),
        evidence: z
          .object({
            sources: z.array(z.string()).optional(),
            signals: z.array(z.string()).optional(),
          })
          .optional(),
      })
    )
    .max(100)
    .optional(),
});

const updateLinkStateSchema = z.object({
  profileId: z.string().min(1),
  linkId: z.string().min(1),
  action: z.enum(['accept', 'dismiss']),
  expectedVersion: z.number().int().min(1).optional(),
});

export async function PUT(req: Request) {
  try {
    return await withDbSessionTx(async (tx, clerkUserId) => {
      // Apply rate limiting
      const { allowed, headers: rateLimitHeaders } =
        await checkRateLimit(clerkUserId);
      if (!allowed) {
        return NextResponse.json(
          { error: 'Rate limit exceeded. Please try again later.' },
          { status: 429, headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders } }
        );
      }

      const parsedBody = await parseJsonBody<unknown>(req, {
        route: 'PUT /api/dashboard/social-links',
        headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders },
      });
      if (!parsedBody.ok) {
        return parsedBody.response;
      }
      const rawBody = parsedBody.data;
      if (rawBody == null || typeof rawBody !== 'object') {
        return NextResponse.json(
          { error: 'Invalid request body' },
          { status: 400, headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders } }
        );
      }

      const parsed = updateSocialLinksSchema.safeParse(rawBody);
      if (!parsed.success) {
        const issues = parsed.error.issues;
        const hasInvalidPlatform = issues.some(
          issue => issue.message === 'Invalid platform'
        );
        const message = hasInvalidPlatform
          ? 'Invalid platform'
          : 'Invalid request body';
        return NextResponse.json(
          { error: message },
          { status: 400, headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders } }
        );
      }

      const {
        profileId,
        links: parsedLinks,
        idempotencyKey,
        expectedVersion,
      } = parsed.data;
      const links = parsedLinks ?? [];

      if (!profileId) {
        return NextResponse.json(
          { error: 'Profile ID is required' },
          { status: 400, headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders } }
        );
      }

      // Check idempotency key
      if (idempotencyKey) {
        const { cached, response } = await checkIdempotencyKey(
          idempotencyKey,
          clerkUserId,
          'PUT:/api/dashboard/social-links'
        );
        if (cached && response) {
          return response;
        }
      }

      // Verify the profile belongs to the authenticated user
      const [profile] = await tx
        .select({
          id: creatorProfiles.id,
          usernameNormalized: creatorProfiles.usernameNormalized,
          avatarUrl: creatorProfiles.avatarUrl,
          avatarLockedByUser: creatorProfiles.avatarLockedByUser,
          userId: creatorProfiles.userId,
        })
        .from(creatorProfiles)
        .innerJoin(users, eq(users.id, creatorProfiles.userId))
        .where(
          and(eq(creatorProfiles.id, profileId), eq(users.clerkId, clerkUserId))
        )
        .limit(1);

      if (!profile) {
        const response = { error: 'Profile not found' };
        await storeIdempotencyKey(
          idempotencyKey ?? '',
          clerkUserId,
          'PUT:/api/dashboard/social-links',
          404,
          response
        );
        return NextResponse.json(response, {
          status: 404,
          headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders },
        });
      }

      // Validate URLs with enhanced validation (blocks internal IPs)
      for (const link of links) {
        const validation = validateSocialLinkUrl(link.url);
        if (!validation.valid) {
          const response = { error: validation.error };
          await storeIdempotencyKey(
            idempotencyKey ?? '',
            clerkUserId,
            'PUT:/api/dashboard/social-links',
            400,
            response
          );
          return NextResponse.json(response, {
            status: 400,
            headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders },
          });
        }
      }

      // Get existing links with their versions for optimistic locking
      const existingLinks = await tx
        .select({
          id: socialLinks.id,
          sourceType: socialLinks.sourceType,
          version: socialLinks.version,
        })
        .from(socialLinks)
        .where(eq(socialLinks.creatorProfileId, profileId));

      // Check optimistic locking if expectedVersion is provided
      // Empty state is treated as version 0 to ensure new links start from known state
      if (expectedVersion !== undefined) {
        const currentVersion =
          existingLinks.length > 0
            ? Math.max(...existingLinks.map(l => l.version ?? 1))
            : 0;
        if (currentVersion !== expectedVersion) {
          const response = {
            error: 'Conflict: Links have been modified by another request',
            code: 'VERSION_CONFLICT',
            currentVersion,
            expectedVersion,
          };
          return NextResponse.json(response, {
            status: 409,
            headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders },
          });
        }
      }

      // Calculate next version (increment from max existing version)
      const currentMaxVersion =
        existingLinks.length > 0
          ? Math.max(...existingLinks.map(l => l.version ?? 1))
          : 0;
      const nextVersion = currentMaxVersion + 1;

      // Delete only manual/admin links to preserve ingested suggestions
      const removableIds = existingLinks
        .filter(link => (link.sourceType ?? 'manual') !== 'ingested')
        .map(link => link.id);

      if (removableIds.length > 0) {
        await tx
          .delete(socialLinks)
          .where(inArray(socialLinks.id, removableIds));
      }

      // Insert new links with new version
      if (links.length > 0) {
        const insertPayload: Array<typeof socialLinks.$inferInsert> = links.map(
          (l, idx) => {
            const detected = validateLink(l.url);
            const normalizedUrl = detected?.normalizedUrl ?? l.url;
            const evidence = {
              sources: l.evidence?.sources ?? [],
              signals: l.evidence?.signals ?? [],
            };
            const scored = computeLinkConfidence({
              sourceType: l.sourceType ?? 'manual',
              signals: evidence.signals,
              sources: [...evidence.sources, 'dashboard'],
              usernameNormalized: profile.usernameNormalized ?? null,
              url: normalizedUrl,
              existingConfidence:
                typeof l.confidence === 'number' ? l.confidence : null,
            });
            const state =
              l.state ??
              (l.isActive === false || l.state === 'suggested'
                ? 'suggested'
                : scored.state);
            const confidence =
              typeof l.confidence === 'number'
                ? Number(l.confidence.toFixed(2))
                : scored.confidence;

            return {
              creatorProfileId: profileId,
              platform: l.platform,
              platformType: detected?.platform.category ?? 'custom',
              url: normalizedUrl,
              sortOrder: l.sortOrder ?? idx,
              state,
              isActive: state === 'active',
              confidence: confidence.toFixed(2),
              sourcePlatform: l.sourcePlatform,
              sourceType: l.sourceType ?? 'manual',
              evidence: {
                ...evidence,
                sources: Array.from(new Set(evidence.sources)),
                signals: Array.from(new Set(evidence.signals)),
              },
              displayText: l.displayText || null,
              version: nextVersion,
            };
          }
        );

        await tx.insert(socialLinks).values(insertPayload);
      }

      // Update version on any remaining ingested links to maintain consistency
      if (existingLinks.length > removableIds.length) {
        const ingestedIds = existingLinks
          .filter(link => link.sourceType === 'ingested')
          .map(link => link.id);
        if (ingestedIds.length > 0) {
          await tx
            .update(socialLinks)
            .set({ version: nextVersion, updatedAt: new Date() })
            .where(inArray(socialLinks.id, ingestedIds));
        }
      }

      // Store successful response in idempotency key
      const successResponse = { ok: true, version: nextVersion };
      await storeIdempotencyKey(
        idempotencyKey ?? '',
        clerkUserId,
        'PUT:/api/dashboard/social-links',
        200,
        successResponse
      );

      // Magic profile enrichment (non-blocking, outside transaction for safety)
      // Note: We schedule this but don't await it inside the transaction
      const enrichmentPromise = (async () => {
        try {
          if (links.length > 0) {
            await maybeSetProfileAvatarFromLinks({
              db,
              clerkUserId,
              profileId,
              userId: profile.userId ?? null,
              currentAvatarUrl: profile.avatarUrl ?? null,
              avatarLockedByUser: profile.avatarLockedByUser ?? null,
              links: links.map(link => link.url),
            });
          }
        } catch (error) {
          // Non-blocking: link saving should succeed even if enrichment fails.
          // Log to Sentry for observability
          Sentry.captureException(error, {
            tags: { operation: 'profile_enrichment' },
            extra: { profileId, clerkUserId },
          });
        }
      })();

      // Schedule ingestion jobs (non-blocking)
      const ingestionPromise = (async () => {
        const linktreeTargets = links.filter(
          link => link.platform === 'linktree' || isLinktreeUrl(link.url)
        );
        const beaconsTargets = links
          .map(link => {
            const validated = validateBeaconsUrl(link.url);
            if (!validated) return null;
            return link.platform === 'beacons' || isBeaconsUrl(validated)
              ? { ...link, url: validated }
              : null;
          })
          .filter((link): link is NonNullable<typeof link> => Boolean(link));
        const layloTargets = links.filter(
          link => link.platform === 'laylo' || isLayloUrl(link.url)
        );
        const youtubeTargets = links
          .map(link => {
            const validated = validateYouTubeChannelUrl(link.url);
            return validated ? { ...link, url: validated } : null;
          })
          .filter((link): link is NonNullable<typeof link> => Boolean(link));

        const jobs: Promise<unknown>[] = [];

        if (beaconsTargets.length > 0) {
          jobs.push(
            ...beaconsTargets.map(link =>
              enqueueBeaconsIngestionJob({
                creatorProfileId: profileId,
                sourceUrl: link.url,
              }).catch(err => {
                console.error('Failed to enqueue beacons ingestion job', err);
                return null;
              })
            )
          );
        }

        if (linktreeTargets.length > 0) {
          jobs.push(
            ...linktreeTargets.map(link =>
              enqueueLinktreeIngestionJob({
                creatorProfileId: profileId,
                sourceUrl: link.url,
              }).catch(err => {
                console.error('Failed to enqueue linktree ingestion job', err);
                return null;
              })
            )
          );
        }

        if (layloTargets.length > 0) {
          jobs.push(
            ...layloTargets.map(link =>
              enqueueLayloIngestionJob({
                creatorProfileId: profileId,
                sourceUrl: link.url,
              }).catch(err => {
                console.error('Failed to enqueue laylo ingestion job', err);
                return null;
              })
            )
          );
        }

        if (youtubeTargets.length > 0) {
          jobs.push(
            ...youtubeTargets.map(link =>
              enqueueYouTubeIngestionJob({
                creatorProfileId: profileId,
                sourceUrl: link.url,
              }).catch(err => {
                console.error('Failed to enqueue youtube ingestion job', err);
                return null;
              })
            )
          );
        }

        await Promise.all(jobs);
      })();

      // Wait for background tasks but don't let failures affect the response.
      // Failures are logged for follow-up but shouldn't block the user.
      Promise.all([enrichmentPromise, ingestionPromise]).catch(error =>
        captureError('Social links enrichment or ingestion failed', error, {
          route: '/api/dashboard/social-links',
          profileId,
          action: 'background_processing',
        })
      );

      return NextResponse.json(successResponse, {
        status: 200,
        headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders },
      });
    });
  } catch (error) {
    console.error('Error updating social links:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    return await withDbSessionTx(async (tx, clerkUserId) => {
      // Apply rate limiting
      const { allowed, headers: rateLimitHeaders } =
        await checkRateLimit(clerkUserId);
      if (!allowed) {
        return NextResponse.json(
          { error: 'Rate limit exceeded. Please try again later.' },
          { status: 429, headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders } }
        );
      }

      const parsedBody = await parseJsonBody<unknown>(req, {
        route: 'PATCH /api/dashboard/social-links',
        headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders },
      });
      if (!parsedBody.ok) {
        return parsedBody.response;
      }
      const rawBody = parsedBody.data;
      if (rawBody == null || typeof rawBody !== 'object') {
        return NextResponse.json(
          { error: 'Invalid request body' },
          { status: 400, headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders } }
        );
      }

      const parsed = updateLinkStateSchema.safeParse(rawBody);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid request body' },
          { status: 400, headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders } }
        );
      }

      const { profileId, linkId, action, expectedVersion } = parsed.data;

      const [profile] = await tx
        .select({
          id: creatorProfiles.id,
          usernameNormalized: creatorProfiles.usernameNormalized,
        })
        .from(creatorProfiles)
        .innerJoin(users, eq(users.id, creatorProfiles.userId))
        .where(
          and(eq(creatorProfiles.id, profileId), eq(users.clerkId, clerkUserId))
        )
        .limit(1);

      if (!profile) {
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404, headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders } }
        );
      }

      const [link] = await tx
        .select({
          id: socialLinks.id,
          creatorProfileId: socialLinks.creatorProfileId,
          platform: socialLinks.platform,
          platformType: socialLinks.platformType,
          url: socialLinks.url,
          sortOrder: socialLinks.sortOrder,
          isActive: socialLinks.isActive,
          displayText: socialLinks.displayText,
          state: socialLinks.state,
          confidence: socialLinks.confidence,
          sourcePlatform: socialLinks.sourcePlatform,
          sourceType: socialLinks.sourceType,
          evidence: socialLinks.evidence,
          version: socialLinks.version,
        })
        .from(socialLinks)
        .where(
          and(
            eq(socialLinks.id, linkId),
            eq(socialLinks.creatorProfileId, profile.id)
          )
        )
        .limit(1);

      if (!link) {
        return NextResponse.json(
          { error: 'Link not found' },
          { status: 404, headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders } }
        );
      }

      // PATCH state validation: only allow transitions from 'suggested' state
      const currentState = link.state as 'active' | 'suggested' | 'rejected';
      if (currentState !== 'suggested') {
        return NextResponse.json(
          {
            error: `Cannot ${action} link: only suggested links can be accepted or dismissed`,
            code: 'INVALID_STATE_TRANSITION',
            currentState,
          },
          { status: 400, headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders } }
        );
      }

      // Check optimistic locking
      const currentVersion = link.version ?? 1;
      if (expectedVersion !== undefined && currentVersion !== expectedVersion) {
        return NextResponse.json(
          {
            error: 'Conflict: Link has been modified by another request',
            code: 'VERSION_CONFLICT',
            currentVersion,
            expectedVersion,
          },
          { status: 409, headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders } }
        );
      }

      const evidenceRaw =
        (link.evidence as { sources?: string[]; signals?: string[] }) || {};
      const nextEvidence = {
        sources: Array.from(
          new Set([...(evidenceRaw.sources ?? []), 'dashboard'])
        ),
        signals: Array.from(
          new Set(
            [
              ...(evidenceRaw.signals ?? []),
              action === 'accept' ? 'kept_after_claim' : undefined,
            ].filter(Boolean) as string[]
          )
        ),
      };

      const existingConfidence =
        typeof link.confidence === 'number'
          ? link.confidence
          : Number.parseFloat(String(link.confidence ?? '0'));

      const scored = computeLinkConfidence({
        sourceType: link.sourceType ?? 'manual',
        signals: nextEvidence.signals,
        sources: nextEvidence.sources,
        usernameNormalized: profile.usernameNormalized ?? null,
        url: link.url,
        existingConfidence,
      });

      const nextState = action === 'accept' ? 'active' : 'rejected';
      const nextConfidence =
        action === 'accept' ? Math.max(scored.confidence, 0.7) : 0;
      const nextVersion = currentVersion + 1;

      const [updated] = await tx
        .update(socialLinks)
        .set({
          state: nextState,
          isActive: action === 'accept',
          confidence: nextConfidence.toFixed(2),
          evidence: nextEvidence,
          version: nextVersion,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(socialLinks.id, link.id),
            // Double-check version in WHERE for extra safety
            eq(socialLinks.version, currentVersion)
          )
        )
        .returning({
          id: socialLinks.id,
          platform: socialLinks.platform,
          platformType: socialLinks.platformType,
          url: socialLinks.url,
          sortOrder: socialLinks.sortOrder,
          isActive: socialLinks.isActive,
          displayText: socialLinks.displayText,
          state: socialLinks.state,
          confidence: socialLinks.confidence,
          sourcePlatform: socialLinks.sourcePlatform,
          sourceType: socialLinks.sourceType,
          evidence: socialLinks.evidence,
          version: socialLinks.version,
        });

      // If no rows updated, version changed between SELECT and UPDATE
      if (!updated) {
        return NextResponse.json(
          {
            error: 'Conflict: Link was modified during the update',
            code: 'VERSION_CONFLICT',
          },
          { status: 409, headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders } }
        );
      }

      return NextResponse.json(
        { ok: true, link: updated },
        { status: 200, headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders } }
      );
    });
  } catch (error) {
    console.error('Error updating social link state:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
