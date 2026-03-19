import {
  and,
  asc,
  desc,
  sql as drizzleSql,
  eq,
  gt,
  gte,
  or,
  type SQL,
} from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withDbSessionTx } from '@/lib/auth/session';
import {
  buildCursorCondition,
  decodeCursor,
  encodeCursor,
} from '@/lib/db/queries/audience-cursor';
import { verifyProfileOwnership } from '@/lib/db/queries/shared';
import { audienceMembers, clickEvents } from '@/lib/db/schema/analytics';
import { tipAudience } from '@/lib/db/schema/tip-audience';
import { captureError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { logger } from '@/lib/utils/logger';
import {
  type MembersQueryParams,
  membersQuerySchema,
} from '@/lib/validation/schemas';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

type AudienceSegment = MembersQueryParams['segments'][number];

/**
 * Maps a validated segment value to its corresponding SQL condition.
 */
const segmentToCondition = (segment: AudienceSegment) => {
  switch (segment) {
    case 'highIntent':
      return eq(audienceMembers.intentLevel, 'high');
    case 'returning':
      return gt(audienceMembers.visits, 1);
    case 'frequent':
      return gte(audienceMembers.visits, 3);
    case 'recent24h':
      return gt(
        audienceMembers.lastSeenAt,
        drizzleSql`NOW() - INTERVAL '24 hours'`
      );
  }
};

/**
 * Builds a combined SQL condition from multiple segment filters using OR
 * semantics: selecting multiple segments shows members matching ANY of the
 * selected segments (union), not all of them (intersection).
 */
const buildSegmentCondition = (segments: AudienceSegment[]) => {
  if (segments.length === 0) {
    return drizzleSql<boolean>`true`;
  }

  const conditions = segments.map(segmentToCondition);

  return conditions.length === 1 ? conditions[0] : or(...conditions)!;
};

const MEMBER_SORT_COLUMNS = {
  lastSeen: audienceMembers.lastSeenAt,
  visits: audienceMembers.visits,
  intent: audienceMembers.intentLevel,
  type: audienceMembers.type,
  engagement: audienceMembers.engagementScore,
  createdAt: audienceMembers.firstSeenAt,
} as const;

function buildViewCondition(
  view: 'all' | 'identified' | 'anonymous'
): SQL<boolean> {
  if (view === 'anonymous') {
    return eq(audienceMembers.type, 'anonymous') as SQL<boolean>;
  }
  if (view === 'identified') {
    return or(
      eq(audienceMembers.type, 'email'),
      eq(audienceMembers.type, 'sms'),
      eq(audienceMembers.type, 'spotify'),
      eq(audienceMembers.type, 'customer')
    ) as SQL<boolean>;
  }
  return drizzleSql<boolean>`true`;
}

export async function GET(request: NextRequest) {
  try {
    return await withDbSessionTx(async (tx, clerkUserId) => {
      const { searchParams } = new URL(request.url);
      const parsed = membersQuerySchema.safeParse({
        profileId: searchParams.get('profileId'),
        sort: searchParams.get('sort') ?? undefined,
        direction: searchParams.get('direction') ?? undefined,
        cursor: searchParams.get('cursor') ?? undefined,
        page: searchParams.get('page') ?? undefined,
        pageSize: searchParams.get('pageSize') ?? undefined,
        segments: searchParams.getAll('segments'),
      });

      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid audience request' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const { profileId, sort, direction, cursor, pageSize, segments } =
        parsed.data;
      const viewParam = searchParams.get('view');
      const view =
        viewParam === 'identified' || viewParam === 'anonymous'
          ? viewParam
          : 'all';

      // Verify user owns the profile
      const profile = await verifyProfileOwnership(tx, profileId, clerkUserId);
      if (!profile) {
        return NextResponse.json(
          { rows: [], total: null, hasMore: false, nextCursor: null },
          { status: 200, headers: NO_STORE_HEADERS }
        );
      }

      const sortColumn = MEMBER_SORT_COLUMNS[sort];
      const orderFn = direction === 'asc' ? asc : desc;
      const segmentCondition = buildSegmentCondition(segments);
      const viewCondition = buildViewCondition(view);

      // Keyset WHERE clause from cursor — avoids full-table OFFSET scan (JOV-1263).
      let cursorCondition: SQL<unknown> = drizzleSql`true`;
      if (cursor) {
        const decoded = decodeCursor(cursor);
        if (decoded) {
          const { v: cursorSortVal, id: cursorId } = decoded;
          cursorCondition = buildCursorCondition(
            direction,
            sortColumn,
            audienceMembers.id,
            cursorSortVal,
            cursorId
          );
        }
      }

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
          utmParams: audienceMembers.utmParams,
          email: audienceMembers.email,
          phone: audienceMembers.phone,
          spotifyConnected: audienceMembers.spotifyConnected,
          purchaseCount: audienceMembers.purchaseCount,
          tipAmountTotalCents:
            drizzleSql<number>`COALESCE(${tipAudience.tipAmountTotalCents}, 0)`.as(
              'tip_amount_total_cents'
            ),
          tipCount: drizzleSql<number>`COALESCE(${tipAudience.tipCount}, 0)`.as(
            'tip_count'
          ),
          // LTV metrics are batch-fetched after pagination to avoid correlated subqueries.
          ltvStreamingClicks: drizzleSql<number>`0`.as('ltv_streaming_clicks'),
          ltvTipClickValueCents: drizzleSql<number>`0`.as(
            'ltv_tip_click_value_cents'
          ),
          ltvMerchSalesCents: drizzleSql<number>`0`.as('ltv_merch_sales_cents'),
          ltvTicketSalesCents: drizzleSql<number>`0`.as(
            'ltv_ticket_sales_cents'
          ),
          tags: audienceMembers.tags,
          lastSeenAt: audienceMembers.lastSeenAt,
          createdAt: audienceMembers.firstSeenAt,
        })
        .from(audienceMembers)
        .leftJoin(
          tipAudience,
          and(
            eq(tipAudience.profileId, audienceMembers.creatorProfileId),
            eq(tipAudience.email, audienceMembers.email)
          )
        )
        .where(
          and(
            eq(audienceMembers.creatorProfileId, profileId),
            segmentCondition,
            viewCondition,
            cursorCondition
          )
        );

      // Fetch pageSize+1 to detect hasMore without COUNT(*) (JOV-1260, JOV-1263).
      const rawRows = await baseQuery
        .orderBy(orderFn(sortColumn), orderFn(audienceMembers.id))
        .limit(pageSize + 1);

      const hasMore = rawRows.length > pageSize;
      const rows = hasMore ? rawRows.slice(0, pageSize) : rawRows;

      // Batch-fetch LTV click data for the current page's members.
      // Replaces per-row correlated subqueries with a single aggregation query.
      const memberIds = rows.map(r => r.id);
      const ltvMap = new Map<
        string,
        { streamingClicks: number; tipValue: number }
      >();
      if (memberIds.length > 0) {
        const ltvRows = await tx
          .select({
            audienceMemberId: clickEvents.audienceMemberId,
            streamingClicks: drizzleSql<number>`COALESCE(COUNT(*) FILTER (
                WHERE ${clickEvents.linkType} = 'listen'
                  AND (${clickEvents.isBot} = false OR ${clickEvents.isBot} IS NULL)
              ), 0)`.as('streaming_clicks'),
            tipValue: drizzleSql<number>`COALESCE(SUM(
                CASE
                  WHEN ${clickEvents.linkType} = 'tip' AND (${clickEvents.isBot} = false OR ${clickEvents.isBot} IS NULL)
                    THEN COALESCE((NULLIF(${clickEvents.metadata} ->> 'tipAmountCents', '')::integer), 500)
                  ELSE 0
                END
              ), 0)`.as('tip_value'),
          })
          .from(clickEvents)
          .where(
            drizzleSql`${clickEvents.audienceMemberId} IN (${drizzleSql.join(
              memberIds.map(id => drizzleSql`${id}`),
              drizzleSql`, `
            )})`
          )
          .groupBy(clickEvents.audienceMemberId);

        for (const row of ltvRows) {
          if (row.audienceMemberId) {
            ltvMap.set(row.audienceMemberId, {
              streamingClicks: row.streamingClicks,
              tipValue: row.tipValue,
            });
          }
        }
      }

      // Build next-page cursor from the last returned row.
      let nextCursor: string | null = null;
      if (hasMore && rows.length > 0) {
        const lastRow = rows[rows.length - 1];
        const rawSortVal = lastRow.lastSeenAt;
        const sortValStr =
          rawSortVal instanceof Date
            ? rawSortVal.toISOString()
            : String(rawSortVal ?? '');
        nextCursor = encodeCursor(sortValStr, lastRow.id);
      }

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
        utmParams: member.utmParams ?? {},
        email: member.email,
        phone: member.phone,
        spotifyConnected: Boolean(member.spotifyConnected),
        purchaseCount: member.purchaseCount,
        tipAmountTotalCents: member.tipAmountTotalCents ?? 0,
        tipCount: member.tipCount ?? 0,
        ltvStreamingClicks: ltvMap.get(member.id)?.streamingClicks ?? 0,
        ltvTipClickValueCents: ltvMap.get(member.id)?.tipValue ?? 0,
        ltvMerchSalesCents: member.ltvMerchSalesCents ?? 0,
        ltvTicketSalesCents: member.ltvTicketSalesCents ?? 0,
        tags: Array.isArray(member.tags) ? member.tags : [],
        lastSeenAt: serializeDate(member.lastSeenAt),
        createdAt: serializeDate(member.createdAt),
      }));

      // total is null — clients use hasMore / nextCursor for pagination control.
      return NextResponse.json(
        { rows: members, total: null, hasMore, nextCursor },
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
