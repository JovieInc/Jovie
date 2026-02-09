import { and, asc, desc, sql as drizzleSql, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withDbSessionTx } from '@/lib/auth/session';
import { verifyProfileOwnership } from '@/lib/db/queries/shared';
import { audienceMembers } from '@/lib/db/schema/analytics';
import { captureError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { logger } from '@/lib/utils/logger';
import { membersQuerySchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const MEMBER_SORT_COLUMNS = {
  lastSeen: audienceMembers.lastSeenAt,
  visits: audienceMembers.visits,
  intent: audienceMembers.intentLevel,
  type: audienceMembers.type,
  engagement: audienceMembers.engagementScore,
  createdAt: audienceMembers.firstSeenAt,
} as const;

export async function GET(request: NextRequest) {
  try {
    return await withDbSessionTx(async (tx, clerkUserId) => {
      const { searchParams } = new URL(request.url);
      const parsed = membersQuerySchema.safeParse({
        profileId: searchParams.get('profileId'),
        sort: searchParams.get('sort') ?? undefined,
        direction: searchParams.get('direction') ?? undefined,
        page: searchParams.get('page') ?? undefined,
        pageSize: searchParams.get('pageSize') ?? undefined,
      });

      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid audience request' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const { profileId, sort, direction, page, pageSize } = parsed.data;

      // Verify user owns the profile
      const profile = await verifyProfileOwnership(tx, profileId, clerkUserId);
      if (!profile) {
        return NextResponse.json(
          { members: [], total: 0 },
          { status: 200, headers: NO_STORE_HEADERS }
        );
      }

      const sortColumn = MEMBER_SORT_COLUMNS[sort];
      const orderFn = direction === 'asc' ? asc : desc;
      const offset = (page - 1) * pageSize;

      const baseQuery = tx
        .select({
          id: audienceMembers.id,
          type: audienceMembers.type,
          displayName: audienceMembers.displayName,
          visits: audienceMembers.visits,
          engagementScore: audienceMembers.engagementScore,
          intentLevel: audienceMembers.intentLevel,
          geoCity: audienceMembers.geoCity,
          geoCountry: audienceMembers.geoCountry,
          deviceType: audienceMembers.deviceType,
          latestActions: audienceMembers.latestActions,
          referrerHistory: audienceMembers.referrerHistory,
          email: audienceMembers.email,
          phone: audienceMembers.phone,
          spotifyConnected: audienceMembers.spotifyConnected,
          purchaseCount: audienceMembers.purchaseCount,
          tags: audienceMembers.tags,
          lastSeenAt: audienceMembers.lastSeenAt,
          createdAt: audienceMembers.firstSeenAt,
        })
        .from(audienceMembers)
        .where(eq(audienceMembers.creatorProfileId, profileId));

      const [rows, [{ total }]] = await Promise.all([
        baseQuery.orderBy(orderFn(sortColumn)).limit(pageSize).offset(offset),
        tx
          .select({
            total: drizzleSql`COALESCE(COUNT(${audienceMembers.id}), 0)`,
          })
          .from(audienceMembers)
          .where(eq(audienceMembers.creatorProfileId, profileId)),
      ]);

      const serializeDate = (value?: Date | string | null) => {
        if (!value) return null;
        return typeof value === 'string' ? value : value.toISOString();
      };

      const members = rows.map(member => ({
        id: member.id,
        type: member.type,
        displayName: member.displayName ?? null,
        visits: member.visits,
        engagementScore: member.engagementScore,
        intentLevel: member.intentLevel,
        geoCity: member.geoCity,
        geoCountry: member.geoCountry,
        deviceType: member.deviceType,
        latestActions: Array.isArray(member.latestActions)
          ? member.latestActions
          : [],
        referrerHistory: Array.isArray(member.referrerHistory)
          ? member.referrerHistory
          : [],
        email: member.email,
        phone: member.phone,
        spotifyConnected: Boolean(member.spotifyConnected),
        purchaseCount: member.purchaseCount,
        tags: Array.isArray(member.tags) ? member.tags : [],
        lastSeenAt: serializeDate(member.lastSeenAt),
        createdAt: serializeDate(member.createdAt),
      }));

      return NextResponse.json(
        { members, total: Number(total ?? 0) },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    });
  } catch (error) {
    logger.error('[Dashboard Audience] Failed to load members', error);
    if (!(error instanceof Error && error.message === 'Unauthorized')) {
      await captureError('Audience members fetch failed', error, {
        route: '/api/dashboard/audience/members',
        method: 'GET',
      });
    }
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(
      { error: 'Unable to load audience members' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

const deleteSchema = z.object({
  memberId: z.string().uuid(),
  profileId: z.string().uuid(),
});

/**
 * DELETE /api/dashboard/audience/members
 *
 * Remove an audience member (unsubscribe/delete) from the creator's audience.
 * Verifies ownership before deletion.
 */
export async function DELETE(request: NextRequest) {
  try {
    return await withDbSessionTx(async (tx, clerkUserId) => {
      const parsedBody = await parseJsonBody<z.infer<typeof deleteSchema>>(
        request,
        {
          route: 'DELETE /api/dashboard/audience/members',
          headers: NO_STORE_HEADERS,
        }
      );

      if (!parsedBody.ok) {
        return parsedBody.response;
      }

      const validation = deleteSchema.safeParse(parsedBody.data);
      if (!validation.success) {
        return NextResponse.json(
          { error: 'Invalid input', details: validation.error.flatten() },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const { memberId, profileId } = validation.data;

      // Verify user owns the profile
      const profile = await verifyProfileOwnership(tx, profileId, clerkUserId);
      if (!profile) {
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      // Delete the member, scoped to the profile for security
      const deleted = await tx
        .delete(audienceMembers)
        .where(
          and(
            eq(audienceMembers.id, memberId),
            eq(audienceMembers.creatorProfileId, profileId)
          )
        )
        .returning({ id: audienceMembers.id });

      if (deleted.length === 0) {
        return NextResponse.json(
          { error: 'Member not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      logger.info('[Dashboard Audience] Member removed', {
        memberId,
        profileId,
      });

      return NextResponse.json(
        { success: true },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    });
  } catch (error) {
    logger.error('[Dashboard Audience] Failed to remove member', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(
      { error: 'Unable to remove audience member' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
