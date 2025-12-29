import * as Sentry from '@sentry/nextjs';
import { and, eq, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { withDbSession, withDbSessionTx } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { creatorProfiles, socialLinks, users } from '@/lib/db/schema';
import { captureError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { computeLinkConfidence } from '@/lib/ingestion/confidence';
import { maybeSetProfileAvatarFromLinks } from '@/lib/ingestion/magic-profile-avatar';
import {
  checkIdempotencyKey,
  checkRateLimit,
  scheduleIngestionJobs,
  storeIdempotencyKey,
  updateLinkStateSchema,
  updateSocialLinksSchema,
} from '@/lib/services/social-links';
import { detectPlatform } from '@/lib/utils/platform-detection';
import { validateSocialLinkUrl } from '@/lib/utils/url-validation';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

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
      const ingestionPromise = scheduleIngestionJobs(profileId, links);

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
