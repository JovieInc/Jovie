import { and, eq } from 'drizzle-orm';
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
  computeLinkVersioning,
  validateLinkStatePayload,
} from './route.shared';

export async function PATCH(req: Request) {
  try {
    return await withDbSessionTx(async (tx, clerkUserId) => {
      const { allowed, headers: rateLimitHeaders } =
        await applyRateLimiting(clerkUserId);
      const combinedHeaders = { ...NO_STORE_HEADERS, ...rateLimitHeaders };

      if (!allowed) {
        return NextResponse.json(
          { error: 'Rate limit exceeded. Please try again later.' },
          { status: 429, headers: combinedHeaders }
        );
      }

      const parsedBody = await parseJsonBody<unknown>(req, {
        route: 'PATCH /api/dashboard/social-links',
        headers: combinedHeaders,
      });
      if (!parsedBody.ok) {
        return parsedBody.response;
      }

      const validationResult = validateLinkStatePayload(
        parsedBody.data,
        combinedHeaders
      );
      if (!validationResult.ok) {
        return validationResult.response;
      }

      const { profileId, linkId, action, expectedVersion } =
        validationResult.data;

      const profile = await getAuthenticatedProfile(tx, profileId, clerkUserId);
      if (!profile) {
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404, headers: combinedHeaders }
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
          { status: 404, headers: combinedHeaders }
        );
      }

      const versioning = computeLinkVersioning({
        existingVersions: [link.version],
        expectedVersion,
        headers: combinedHeaders,
        conflictMessage: 'Conflict: Link has been modified by another request',
      });
      if (!versioning.ok) {
        return versioning.response;
      }

      if (action === 'accept') {
        await tx
          .update(socialLinks)
          .set({
            state: 'active',
            isActive: true,
            version: versioning.nextVersion,
            updatedAt: new Date(),
          })
          .where(eq(socialLinks.id, linkId));

        await invalidateSocialLinksCache(profileId, profile.usernameNormalized);

        const parsedConfidence =
          typeof link.confidence === 'number'
            ? link.confidence
            : Number.parseFloat(String(link.confidence ?? '0'));

        return NextResponse.json(
          {
            ok: true,
            version: versioning.nextVersion,
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
              version: versioning.nextVersion,
            },
          },
          { status: 200, headers: combinedHeaders }
        );
      }

      if (action === 'dismiss') {
        await tx
          .update(socialLinks)
          .set({
            state: 'rejected',
            isActive: false,
            version: versioning.nextVersion,
            updatedAt: new Date(),
          })
          .where(eq(socialLinks.id, linkId));

        await invalidateSocialLinksCache(profileId, profile.usernameNormalized);

        return NextResponse.json(
          { ok: true, version: versioning.nextVersion },
          { status: 200, headers: combinedHeaders }
        );
      }

      return NextResponse.json(
        { error: 'Invalid action. Must be "accept" or "dismiss".' },
        { status: 400, headers: combinedHeaders }
      );
    });
  } catch (error) {
    captureError('Error updating link state', error, {
      route: '/api/dashboard/social-links',
      action: 'patch',
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
