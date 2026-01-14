import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { withDbSessionTx } from '@/lib/auth/session';
import { invalidateSocialLinksCache } from '@/lib/cache';
import { getAuthenticatedProfile } from '@/lib/db/queries/shared';
import { socialLinks } from '@/lib/db/schema';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';
import { updateLinkStateSchema } from '@/lib/validation/schemas';
import { applyRateLimiting, computeLinkVersioning } from './route.shared';

export async function PATCH(req: Request) {
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

      const profile = await getAuthenticatedProfile(tx, profileId, clerkUserId);
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

      const versioning = computeLinkVersioning({
        existingVersions: [link.version],
        expectedVersion,
        headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders },
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
          { status: 200, headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders } }
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
          { status: 200, headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders } }
        );
      }

      return NextResponse.json(
        { error: 'Invalid action. Must be "accept" or "dismiss".' },
        { status: 400, headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders } }
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
