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

export async function DELETE(req: Request) {
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
      } else if (action === 'dismiss') {
        await tx
          .update(socialLinks)
          .set({
            state: 'rejected',
            isActive: false,
            version: versioning.nextVersion,
            updatedAt: new Date(),
          })
          .where(eq(socialLinks.id, linkId));
      }

      await invalidateSocialLinksCache(profileId, profile.usernameNormalized);

      return NextResponse.json(
        { ok: true, version: versioning.nextVersion },
        { status: 200, headers: { ...NO_STORE_HEADERS, ...rateLimitHeaders } }
      );
    });
  } catch (error) {
    captureError('Error updating link state', error, {
      route: '/api/dashboard/social-links',
      action: 'delete',
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
