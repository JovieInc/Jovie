/**
 * Campaign Invites API
 *
 * Lists invites with engagement data for the campaign dashboard.
 */

import type { SQLWrapper } from 'drizzle-orm';
import {
  and,
  count,
  desc,
  sql as drizzleSql,
  eq,
  gte,
  ilike,
} from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { emailEngagement } from '@/lib/db/schema/email-engagement';
import { creatorClaimInvites, creatorProfiles } from '@/lib/db/schema/profiles';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import { toISOStringOrNull } from '@/lib/utils/date';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Invite with engagement data
 */
interface InviteWithEngagement {
  id: string;
  email: string;
  status: string;
  createdAt: string;
  sentAt: string | null;
  profile: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    fitScore: number | null;
    isClaimed: boolean;
  };
  engagement: {
    opened: boolean;
    openedAt: string | null;
    clicked: boolean;
    clickedAt: string | null;
    clickCount: number;
  };
}

type QueryParams = {
  status?: string;
  search?: string;
  limit: number;
  offset: number;
  dateFilter: Date;
};

function parseQueryParams(request: NextRequest): QueryParams {
  const url = new URL(request.url);
  const status = url.searchParams.get('status') || undefined;
  const search = url.searchParams.get('search') || undefined;
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 100);
  const offset = Number(url.searchParams.get('offset')) || 0;
  const days = Number(url.searchParams.get('days')) || 30;

  return {
    status,
    search,
    limit,
    offset,
    dateFilter: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
  };
}

function buildInviteConditions({
  status,
  search,
  dateFilter,
}: QueryParams): SQLWrapper[] {
  const conditions: (SQLWrapper | undefined)[] = [
    gte(creatorClaimInvites.createdAt, dateFilter),
    status ? eq(creatorClaimInvites.status, status as never) : undefined,
    search ? ilike(creatorProfiles.username, `%${search}%`) : undefined,
  ];

  return conditions.filter((clause): clause is SQLWrapper => Boolean(clause));
}

async function fetchInvitesWithProfiles(
  conditions: SQLWrapper[],
  limit: number,
  offset: number
) {
  const invites = await db
    .select({
      id: creatorClaimInvites.id,
      email: creatorClaimInvites.email,
      status: creatorClaimInvites.status,
      createdAt: creatorClaimInvites.createdAt,
      sentAt: creatorClaimInvites.sentAt,
      profileId: creatorProfiles.id,
      username: creatorProfiles.username,
      displayName: creatorProfiles.displayName,
      avatarUrl: creatorProfiles.avatarUrl,
      fitScore: creatorProfiles.fitScore,
      isClaimed: creatorProfiles.isClaimed,
    })
    .from(creatorClaimInvites)
    .innerJoin(
      creatorProfiles,
      eq(creatorClaimInvites.creatorProfileId, creatorProfiles.id)
    )
    .where(and(...conditions))
    .orderBy(desc(creatorClaimInvites.createdAt))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: count() })
    .from(creatorClaimInvites)
    .innerJoin(
      creatorProfiles,
      eq(creatorClaimInvites.creatorProfileId, creatorProfiles.id)
    )
    .where(and(...conditions));

  return {
    invites,
    total: Number(countResult?.count ?? 0),
  };
}

async function fetchEngagementData(inviteIds: string[]) {
  if (inviteIds.length === 0) {
    return [] as const;
  }

  return db
    .select({
      referenceId: emailEngagement.referenceId,
      eventType: emailEngagement.eventType,
      createdAt: emailEngagement.createdAt,
    })
    .from(emailEngagement)
    .where(
      drizzleSql`${emailEngagement.referenceId} = ANY(ARRAY[${drizzleSql.raw(
        inviteIds.map(id => `'${id}'::uuid`).join(',')
      )}])`
    )
    .orderBy(emailEngagement.createdAt);
}

type EngagementSnapshot = {
  opened: boolean;
  openedAt: Date | null;
  clicked: boolean;
  clickedAt: Date | null;
  clickCount: number;
};

function buildEngagementMap(
  engagementData: Awaited<ReturnType<typeof fetchEngagementData>>
) {
  const engagementMap = new Map<string, EngagementSnapshot>();

  for (const event of engagementData) {
    const existing = engagementMap.get(event.referenceId) || {
      opened: false,
      openedAt: null,
      clicked: false,
      clickedAt: null,
      clickCount: 0,
    };

    if (event.eventType === 'open' && !existing.opened) {
      existing.opened = true;
      existing.openedAt = event.createdAt;
    } else if (event.eventType === 'click') {
      if (!existing.clicked) {
        existing.clicked = true;
        existing.clickedAt = event.createdAt;
      }
      existing.clickCount += 1;
    }

    engagementMap.set(event.referenceId, existing);
  }

  return engagementMap;
}

function buildInviteResponse(
  invites: Awaited<ReturnType<typeof fetchInvitesWithProfiles>>['invites'],
  engagementMap: Map<string, EngagementSnapshot>
): InviteWithEngagement[] {
  return invites.map(invite => {
    const engagement = engagementMap.get(invite.id) || {
      opened: false,
      openedAt: null,
      clicked: false,
      clickedAt: null,
      clickCount: 0,
    };

    return {
      id: invite.id,
      email: invite.email,
      status: invite.status || 'pending',
      createdAt: toISOStringOrNull(invite.createdAt) ?? '',
      sentAt: toISOStringOrNull(invite.sentAt),
      profile: {
        id: invite.profileId,
        username: invite.username,
        displayName: invite.displayName,
        avatarUrl: invite.avatarUrl,
        fitScore: invite.fitScore,
        isClaimed: invite.isClaimed ?? false,
      },
      engagement: {
        opened: engagement.opened,
        openedAt: toISOStringOrNull(engagement.openedAt),
        clicked: engagement.clicked,
        clickedAt: toISOStringOrNull(engagement.clickedAt),
        clickCount: engagement.clickCount,
      },
    };
  });
}

export async function GET(request: NextRequest) {
  try {
    const entitlements = await getCurrentUserEntitlements();
    if (!entitlements.isAuthenticated) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    if (!entitlements.isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const query = parseQueryParams(request);
    const conditions = buildInviteConditions(query);
    const { invites, total } = await fetchInvitesWithProfiles(
      conditions,
      query.limit,
      query.offset
    );

    const engagementData = await fetchEngagementData(invites.map(i => i.id));
    const engagementMap = buildEngagementMap(engagementData);
    const result = buildInviteResponse(invites, engagementMap);

    return NextResponse.json(
      {
        ok: true,
        invites: result,
        pagination: {
          total,
          limit: query.limit,
          offset: query.offset,
          hasMore: query.offset + query.limit < total,
        },
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('[Campaign Invites] Failed to fetch invites', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    await captureError('Admin campaign invites failed', error, {
      route: '/api/admin/campaigns/invites',
      method: 'GET',
    });

    return NextResponse.json(
      { error: 'Failed to fetch invites' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
