import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withDbSessionTx } from '@/lib/auth/session';
import { audienceSourceGroups } from '@/lib/db/schema/analytics';
import { captureError } from '@/lib/error-tracking';
import {
  buildAudienceSourceErrorResponse,
  NO_STORE_HEADERS,
  parseAudienceSourcePatchRequest,
  verifyAudienceSourceProfileOrResponse,
} from '../../source-route-helpers';

const updateSourceGroupSchema = z.object({
  profileId: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
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
        'Invalid source group ID',
        updateSourceGroupSchema,
        'Invalid source group payload'
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
      const [group] = await tx
        .update(audienceSourceGroups)
        .set({
          ...(parsedRequest.payload.name
            ? { name: parsedRequest.payload.name }
            : {}),
          ...(typeof parsedRequest.payload.archived === 'boolean'
            ? { archivedAt: parsedRequest.payload.archived ? now : null }
            : {}),
          updatedAt: now,
        })
        .where(
          and(
            eq(audienceSourceGroups.id, id),
            eq(
              audienceSourceGroups.creatorProfileId,
              parsedRequest.payload.profileId
            )
          )
        )
        .returning();

      if (!group) {
        return buildAudienceSourceErrorResponse('Source group not found', 404);
      }

      return NextResponse.json({ group }, { headers: NO_STORE_HEADERS });
    });
  } catch (error) {
    await captureError('Audience source group update failed', error, {
      route: '/api/dashboard/audience/source-groups/[id]',
      method: 'PATCH',
    });
    return NextResponse.json(
      { error: 'Unable to update source group' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
