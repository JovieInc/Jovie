/**
 * Campaign Invites API
 *
 * Lists invites with engagement data for the campaign dashboard.
 */

import { and, count, desc, eq, gte, ilike, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';
import {
  creatorClaimInvites,
  creatorProfiles,
  emailEngagement,
} from '@/lib/db/schema';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
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

    // Parse query params
    const url = new URL(request.url);
    const status = url.searchParams.get('status') || undefined;
    const search = url.searchParams.get('search') || undefined;
    const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 100);
    const offset = Number(url.searchParams.get('offset')) || 0;
    const days = Number(url.searchParams.get('days')) || 30;

    const dateFilter = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Build where conditions
    const conditions = [gte(creatorClaimInvites.createdAt, dateFilter)];

    if (status) {
      conditions.push(eq(creatorClaimInvites.status, status as never));
    }

    if (search) {
      conditions.push(ilike(creatorProfiles.username, `%${search}%`));
    }

    // Fetch invites with profile data
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

    // Get total count for pagination
    const [countResult] = await db
      .select({ count: count() })
      .from(creatorClaimInvites)
      .innerJoin(
        creatorProfiles,
        eq(creatorClaimInvites.creatorProfileId, creatorProfiles.id)
      )
      .where(and(...conditions));

    const total = Number(countResult?.count ?? 0);

    // Fetch engagement data for these invites
    const inviteIds = invites.map(i => i.id);

    const engagementData =
      inviteIds.length > 0
        ? await db
            .select({
              referenceId: emailEngagement.referenceId,
              eventType: emailEngagement.eventType,
              createdAt: emailEngagement.createdAt,
            })
            .from(emailEngagement)
            .where(
              sql`${emailEngagement.referenceId} = ANY(ARRAY[${sql.raw(
                inviteIds.map(id => `'${id}'::uuid`).join(',')
              )}])`
            )
            .orderBy(emailEngagement.createdAt)
        : [];

    // Build engagement map
    const engagementMap = new Map<
      string,
      {
        opened: boolean;
        openedAt: Date | null;
        clicked: boolean;
        clickedAt: Date | null;
        clickCount: number;
      }
    >();

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

    // Build response
    const result: InviteWithEngagement[] = invites.map(invite => {
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
        createdAt: invite.createdAt?.toISOString() ?? '',
        sentAt: invite.sentAt?.toISOString() ?? null,
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
          openedAt: engagement.openedAt?.toISOString() ?? null,
          clicked: engagement.clicked,
          clickedAt: engagement.clickedAt?.toISOString() ?? null,
          clickCount: engagement.clickCount,
        },
      };
    });

    return NextResponse.json(
      {
        ok: true,
        invites: result,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('[Campaign Invites] Failed to fetch invites', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      { error: 'Failed to fetch invites' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
