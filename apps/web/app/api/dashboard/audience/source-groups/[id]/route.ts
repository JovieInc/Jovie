import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withDbSessionTx } from '@/lib/auth/session';
import { verifyProfileOwnership } from '@/lib/db/queries/shared';
import { audienceSourceGroups } from '@/lib/db/schema/analytics';
import { captureError } from '@/lib/error-tracking';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const updateSourceGroupSchema = z.object({
  profileId: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  archived: z.boolean().optional(),
});

const routeParamsSchema = z.object({
  id: z.string().uuid(),
});

async function parseJsonBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error('Malformed JSON');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { readonly params: Promise<{ readonly id: string }> }
) {
  try {
    return await withDbSessionTx(async (tx, clerkUserId) => {
      const parsedParams = routeParamsSchema.safeParse(await params);
      if (!parsedParams.success) {
        return NextResponse.json(
          { error: 'Invalid source group ID' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      let body: unknown;
      try {
        body = await parseJsonBody(request);
      } catch {
        return NextResponse.json(
          { error: 'Malformed JSON' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const { id } = parsedParams.data;
      const parsed = updateSourceGroupSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid source group payload' },
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
      const [group] = await tx
        .update(audienceSourceGroups)
        .set({
          ...(parsed.data.name ? { name: parsed.data.name } : {}),
          ...(typeof parsed.data.archived === 'boolean'
            ? { archivedAt: parsed.data.archived ? now : null }
            : {}),
          updatedAt: now,
        })
        .where(
          and(
            eq(audienceSourceGroups.id, id),
            eq(audienceSourceGroups.creatorProfileId, parsed.data.profileId)
          )
        )
        .returning();

      if (!group) {
        return NextResponse.json(
          { error: 'Source group not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
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
