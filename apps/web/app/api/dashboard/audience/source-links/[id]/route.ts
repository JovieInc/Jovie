import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withDbSessionTx } from '@/lib/auth/session';
import { audienceSourceLinks } from '@/lib/db/schema/analytics';
import { captureError } from '@/lib/error-tracking';
import {
  buildAudienceSourceErrorResponse,
  NO_STORE_HEADERS,
  parseAudienceSourcePatchRequest,
  verifyAudienceSourceProfileOrResponse,
} from '../../source-route-helpers';

const updateSourceLinkSchema = z.object({
  profileId: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  destinationUrl: z.string().url().optional(),
  archived: z.boolean().optional(),
});

const routeParamsSchema = z.object({
  id: z.string().uuid(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { readonly params: Promise<{ readonly id: string }> }
) {
  try {
    return await withDbSessionTx(async (tx, clerkUserId) => {
      const parsedRequest = await parseAudienceSourcePatchRequest(
        request,
        await params,
        routeParamsSchema,
        'Invalid source link ID',
        updateSourceLinkSchema,
        'Invalid source link payload'
      );
      if (parsedRequest.response) {
        return parsedRequest.response;
      }

      const { id } = parsedRequest.params;
      const verification = await verifyAudienceSourceProfileOrResponse(
        tx,
        parsedRequest.payload.profileId,
        clerkUserId
      );
      if (verification.response) {
        return verification.response;
      }

      const now = new Date();
      const [link] = await tx
        .update(audienceSourceLinks)
        .set({
          ...(parsedRequest.payload.name
            ? { name: parsedRequest.payload.name }
            : {}),
          ...(parsedRequest.payload.destinationUrl
            ? { destinationUrl: parsedRequest.payload.destinationUrl }
            : {}),
          ...(typeof parsedRequest.payload.archived === 'boolean'
            ? { archivedAt: parsedRequest.payload.archived ? now : null }
            : {}),
          updatedAt: now,
        })
        .where(
          and(
            eq(audienceSourceLinks.id, id),
            eq(
              audienceSourceLinks.creatorProfileId,
              parsedRequest.payload.profileId
            )
          )
        )
        .returning();

      if (!link) {
        return buildAudienceSourceErrorResponse('Source link not found', 404);
      }

      return NextResponse.json({ link }, { headers: NO_STORE_HEADERS });
    });
  } catch (error) {
    await captureError('Audience source link update failed', error, {
      route: '/api/dashboard/audience/source-links/[id]',
      method: 'PATCH',
    });
    return NextResponse.json(
      { error: 'Unable to update source link' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
