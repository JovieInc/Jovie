import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withDbSessionTx } from '@/lib/auth/session';
import { verifyProfileOwnership } from '@/lib/db/queries/shared';
import { audienceSourceLinks } from '@/lib/db/schema/analytics';
import { captureError } from '@/lib/error-tracking';
import {
  NO_STORE_HEADERS,
  parseSourceRequestJson,
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
      const parsedParams = routeParamsSchema.safeParse(await params);
      if (!parsedParams.success) {
        return NextResponse.json(
          { error: 'Invalid source link ID' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      let body: unknown;
      try {
        body = await parseSourceRequestJson(request);
      } catch {
        return NextResponse.json(
          { error: 'Malformed JSON' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const { id } = parsedParams.data;
      const parsed = updateSourceLinkSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid source link payload' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const profile = await verifyProfileOwnership(
        tx,
        parsed.data.profileId,
        clerkUserId
      );
      if (!profile) {
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      const now = new Date();
      const [link] = await tx
        .update(audienceSourceLinks)
        .set({
          ...(parsed.data.name ? { name: parsed.data.name } : {}),
          ...(parsed.data.destinationUrl
            ? { destinationUrl: parsed.data.destinationUrl }
            : {}),
          ...(typeof parsed.data.archived === 'boolean'
            ? { archivedAt: parsed.data.archived ? now : null }
            : {}),
          updatedAt: now,
        })
        .where(
          and(
            eq(audienceSourceLinks.id, id),
            eq(audienceSourceLinks.creatorProfileId, parsed.data.profileId)
          )
        )
        .returning();

      if (!link) {
        return NextResponse.json(
          { error: 'Source link not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
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
