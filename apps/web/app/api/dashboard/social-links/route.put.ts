import { eq, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { withDbSessionTx } from '@/lib/auth/session';
import { invalidateSocialLinksCache } from '@/lib/cache';
import { getAuthenticatedProfile } from '@/lib/db/queries/shared';
import { socialLinks } from '@/lib/db/schema';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';
import {
  applyRateLimiting,
  buildSocialLinksInsertPayload,
  checkIdempotencyKey,
  computeLinkVersioning,
  enqueueProfileEnrichment,
  processLinkValidation,
  storeIdempotencyKey,
  validateUpdateSocialLinksPayload,
} from './route.shared';

export async function PUT(req: Request) {
  try {
    return await withDbSessionTx(async (tx, clerkUserId) => {
      const { allowed, headers: rateLimitHeaders } =
        await applyRateLimiting(clerkUserId);
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
      const validationResult = validateUpdateSocialLinksPayload(
        parsedBody.data,
        { ...NO_STORE_HEADERS, ...rateLimitHeaders }
      );
      if (!validationResult.ok) {
        return validationResult.response;
      }
      const {
        profileId,
        links: parsedLinks,
        idempotencyKey,
        expectedVersion,
      } = validationResult.data;
      const links = parsedLinks ?? [];
      if (!profileId) {
        return NextResponse.json(
          { error: 'Profile ID is required' },
          { status: 400, headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders } }
        );
      }
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
      const validation = processLinkValidation(links);
      if (!validation.ok) {
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
      const existingLinks = await tx
        .select({
          id: socialLinks.id,
          sourceType: socialLinks.sourceType,
          version: socialLinks.version,
        })
        .from(socialLinks)
        .where(eq(socialLinks.creatorProfileId, profileId));
      const versioning = computeLinkVersioning({
        existingVersions: existingLinks.map(link => link.version),
        expectedVersion,
        headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders },
        conflictMessage:
          'Conflict: Links have been modified by another request',
        emptyVersion: 0,
      });
      if (!versioning.ok) {
        return versioning.response;
      }
      const removableIds = existingLinks
        .filter(link => (link.sourceType ?? 'manual') !== 'ingested')
        .map(link => link.id);
      if (removableIds.length > 0) {
        await tx
          .delete(socialLinks)
          .where(inArray(socialLinks.id, removableIds));
      }
      const insertPayloadResult =
        links.length > 0
          ? buildSocialLinksInsertPayload(
              links,
              profileId,
              profile.usernameNormalized ?? null,
              versioning.nextVersion
            )
          : { payload: [], linkUrls: [] };
      if (insertPayloadResult.payload.length > 0) {
        await tx.insert(socialLinks).values(insertPayloadResult.payload);
      }
      if (existingLinks.length > removableIds.length) {
        const ingestedIds = existingLinks
          .filter(link => link.sourceType === 'ingested')
          .map(link => link.id);
        if (ingestedIds.length > 0) {
          await tx
            .update(socialLinks)
            .set({ version: versioning.nextVersion, updatedAt: new Date() })
            .where(inArray(socialLinks.id, ingestedIds));
        }
      }
      const successResponse = { ok: true, version: versioning.nextVersion };
      await storeIdempotencyKey(
        idempotencyKey ?? '',
        clerkUserId,
        'PUT:/api/dashboard/social-links',
        200,
        successResponse
      );
      await invalidateSocialLinksCache(profileId, profile.usernameNormalized);
      const enrichmentPromise = enqueueProfileEnrichment({
        links: insertPayloadResult.linkUrls,
        profileId,
        clerkUserId,
        userId: profile.userId ?? null,
        avatarUrl: profile.avatarUrl ?? null,
        avatarLockedByUser: profile.avatarLockedByUser ?? null,
      });
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
    captureError('Error updating social links', error, {
      route: '/api/dashboard/social-links',
      action: 'update',
    });
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
