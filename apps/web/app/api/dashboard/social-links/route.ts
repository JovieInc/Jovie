import * as Sentry from '@sentry/nextjs';
import { and, eq, gt, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { withDbSession, withDbSessionTx } from '@/lib/auth/session';
import { invalidateSocialLinksCache } from '@/lib/cache';
import { db } from '@/lib/db';
import { getAuthenticatedProfile } from '@/lib/db/queries/shared';
import {
  creatorProfiles,
  dashboardIdempotencyKeys,
  socialLinks,
  users,
} from '@/lib/db/schema';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS, TTL } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';
import { computeLinkConfidence } from '@/lib/ingestion/confidence';
import { maybeSetProfileAvatarFromLinks } from '@/lib/ingestion/magic-profile-avatar';
import {
  createRateLimitHeaders,
  dashboardLinksRateLimit,
} from '@/lib/rate-limit';
import { detectPlatform } from '@/lib/utils/platform-detection';
import { validateSocialLinkUrl } from '@/lib/utils/url-validation';
import {
  updateSocialLinksSchema as baseUpdateSocialLinksSchema,
  updateLinkStateSchema,
} from '@/lib/validation/schemas';
import { isValidSocialPlatform } from '@/types';

export const runtime = 'nodejs';

/**
 * Idempotency key expiration time.
 * Uses centralized TTL constant for consistency across API routes.
 *
 * NOTE: Expired keys should be cleaned up periodically via a background job
 * or Postgres TTL extension (pg_cron). See dashboard_idempotency_keys table.
 */
const IDEMPOTENCY_KEY_TTL_MS = TTL.IDEMPOTENCY_KEY_MS;

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
      const profile = await getAuthenticatedProfile(db, profileId, clerkUserId);
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

/**
 * Extended update social links schema with platform validation.
 *
 * Uses the centralized baseUpdateSocialLinksSchema and adds route-specific
 * platform validation via superRefine to check against isValidSocialPlatform.
 */
const updateSocialLinksSchema = baseUpdateSocialLinksSchema.superRefine(
  (data, ctx) => {
    if (data.links) {
      data.links.forEach((link, index) => {
        if (!isValidSocialPlatform(link.platform)) {
          ctx.addIssue({
            code: 'custom',
            message: 'Invalid platform',
            path: ['links', index, 'platform'],
          });
        }
      });
    }
  }
);

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
      const profile = await getAuthenticatedProfile(tx, profileId, clerkUserId);

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
            const detected = detectPlatform(l.url);
            const normalizedUrl = detected.normalizedUrl;
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
              platformType: detected.platform.category,
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

      // Invalidate caches for the profile's social links
      // This ensures public profile and dashboard show updated links
      await invalidateSocialLinksCache(profileId, profile.usernameNormalized);

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

      // Wait for background tasks but don't let failures affect the response.
      // Failures are logged for follow-up but shouldn't block the user.
      enrichmentPromise.catch(error =>
        captureError('Social links enrichment failed', error, {
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

/**
 * PATCH handler for accepting/dismissing link suggestions.
 *
 * Updates a link's state to 'active' (accept) or 'rejected' (dismiss).
 * Returns the full link object for accept operations so the client
 * can add it to the active links list.
 */
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

      if (!profileId || !linkId || !action) {
        return NextResponse.json(
          { error: 'Profile ID, Link ID, and action are required' },
          { status: 400, headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders } }
        );
      }

      // Verify the profile belongs to the authenticated user
      const profile = await getAuthenticatedProfile(tx, profileId, clerkUserId);

      if (!profile) {
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404, headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders } }
        );
      }

      // Get the full link to verify it exists and return it for accept
      const [link] = await tx
        .select({
          id: socialLinks.id,
          creatorProfileId: socialLinks.creatorProfileId,
          platform: socialLinks.platform,
          platformType: socialLinks.platformType,
          url: socialLinks.url,
          sortOrder: socialLinks.sortOrder,
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
            eq(socialLinks.creatorProfileId, profileId)
          )
        )
        .limit(1);

      if (!link) {
        return NextResponse.json(
          { error: 'Link not found' },
          { status: 404, headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders } }
        );
      }

      // Check optimistic locking if expectedVersion is provided
      if (expectedVersion !== undefined) {
        const currentVersion = link.version ?? 1;
        if (currentVersion !== expectedVersion) {
          const response = {
            error: 'Conflict: Link has been modified by another request',
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

      const newVersion = (link.version ?? 1) + 1;

      if (action === 'accept') {
        // Activate the link
        await tx
          .update(socialLinks)
          .set({
            state: 'active',
            isActive: true,
            version: newVersion,
            updatedAt: new Date(),
          })
          .where(eq(socialLinks.id, linkId));

        // Invalidate caches
        await invalidateSocialLinksCache(profileId, profile.usernameNormalized);

        // Parse confidence for response
        const parsedConfidence =
          typeof link.confidence === 'number'
            ? link.confidence
            : Number.parseFloat(String(link.confidence ?? '0'));

        // Return full link object for client to add to active links
        return NextResponse.json(
          {
            ok: true,
            version: newVersion,
            link: {
              id: link.id,
              platform: link.platform,
              platformType: link.platformType,
              url: link.url,
              sortOrder: link.sortOrder,
              isActive: true,
              displayText: link.displayText,
              state: 'active',
              confidence: Number.isFinite(parsedConfidence)
                ? parsedConfidence
                : 0,
              sourcePlatform: link.sourcePlatform,
              sourceType: link.sourceType ?? 'ingested',
              evidence: link.evidence,
              version: newVersion,
            },
          },
          { status: 200, headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders } }
        );
      } else if (action === 'dismiss') {
        // Reject the link
        await tx
          .update(socialLinks)
          .set({
            state: 'rejected',
            isActive: false,
            version: newVersion,
            updatedAt: new Date(),
          })
          .where(eq(socialLinks.id, linkId));

        // Invalidate caches
        await invalidateSocialLinksCache(profileId, profile.usernameNormalized);

        return NextResponse.json(
          { ok: true, version: newVersion },
          { status: 200, headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders } }
        );
      }

      // Invalid action
      return NextResponse.json(
        { error: 'Invalid action. Must be "accept" or "dismiss".' },
        { status: 400, headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders } }
      );
    });
  } catch (error) {
    console.error('Error updating link state:', error);
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

export async function DELETE(req: Request) {
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
        route: 'DELETE /api/dashboard/social-links',
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

      if (!profileId || !linkId || !action) {
        return NextResponse.json(
          { error: 'Profile ID, Link ID, and action are required' },
          { status: 400, headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders } }
        );
      }

      // Verify the profile belongs to the authenticated user
      const profile = await getAuthenticatedProfile(tx, profileId, clerkUserId);

      if (!profile) {
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404, headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders } }
        );
      }

      // Get the link to verify it exists and belongs to this profile
      const [link] = await tx
        .select({
          id: socialLinks.id,
          creatorProfileId: socialLinks.creatorProfileId,
          version: socialLinks.version,
        })
        .from(socialLinks)
        .where(
          and(
            eq(socialLinks.id, linkId),
            eq(socialLinks.creatorProfileId, profileId)
          )
        )
        .limit(1);

      if (!link) {
        return NextResponse.json(
          { error: 'Link not found' },
          { status: 404, headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders } }
        );
      }

      // Check optimistic locking if expectedVersion is provided
      if (expectedVersion !== undefined) {
        const currentVersion = link.version ?? 1;
        if (currentVersion !== expectedVersion) {
          const response = {
            error: 'Conflict: Link has been modified by another request',
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

      if (action === 'accept') {
        // Activate the link
        await tx
          .update(socialLinks)
          .set({
            state: 'active',
            isActive: true,
            version: (link.version ?? 1) + 1,
            updatedAt: new Date(),
          })
          .where(eq(socialLinks.id, linkId));
      } else if (action === 'dismiss') {
        // Reject the link
        await tx
          .update(socialLinks)
          .set({
            state: 'rejected',
            isActive: false,
            version: (link.version ?? 1) + 1,
            updatedAt: new Date(),
          })
          .where(eq(socialLinks.id, linkId));
      }

      // Invalidate caches for the profile's social links
      // This ensures public profile and dashboard show updated link state
      await invalidateSocialLinksCache(profileId, profile.usernameNormalized);

      return NextResponse.json(
        { ok: true, version: (link.version ?? 1) + 1 },
        { status: 200, headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders } }
      );
    });
  } catch (error) {
    console.error('Error updating link state:', error);
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
