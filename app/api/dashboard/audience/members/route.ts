import { and, asc, desc, sql as drizzleSql, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withDbSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { audienceMembers, creatorProfiles, users } from '@/lib/db/schema';

const MEMBER_SORT_COLUMNS = {
  lastSeen: audienceMembers.lastSeenAt,
  visits: audienceMembers.visits,
  intent: audienceMembers.intentLevel,
  type: audienceMembers.type,
  engagement: audienceMembers.engagementScore,
  createdAt: audienceMembers.firstSeenAt,
} as const;

const querySchema = z.object({
  profileId: z.string().uuid(),
  sort: z
    .enum(['lastSeen', 'visits', 'intent', 'type', 'engagement', 'createdAt'])
    .default('lastSeen'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  page: z.preprocess(val => Number(val ?? 1), z.number().int().min(1)),
  pageSize: z.preprocess(
    val => Number(val ?? 10),
    z.number().int().min(1).max(100)
  ),
});

export async function GET(request: NextRequest) {
  try {
    return await withDbSession(async clerkUserId => {
      const { searchParams } = new URL(request.url);
      const parsed = querySchema.safeParse({
        profileId: searchParams.get('profileId'),
        sort: searchParams.get('sort') ?? undefined,
        direction: searchParams.get('direction') ?? undefined,
        page: searchParams.get('page') ?? undefined,
        pageSize: searchParams.get('pageSize') ?? undefined,
      });

      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid audience request' },
          { status: 400 }
        );
      }

      const { profileId, sort, direction, page, pageSize } = parsed.data;
      const sortColumn = MEMBER_SORT_COLUMNS[sort];
      const orderFn = direction === 'asc' ? asc : desc;
      const offset = (page - 1) * pageSize;

      const baseQuery = db
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
        .innerJoin(
          creatorProfiles,
          eq(audienceMembers.creatorProfileId, creatorProfiles.id)
        )
        .innerJoin(users, eq(creatorProfiles.userId, users.id))
        .where(
          and(
            eq(users.clerkId, clerkUserId),
            eq(audienceMembers.creatorProfileId, profileId)
          )
        );

      const [rows, [{ total }]] = await Promise.all([
        baseQuery.orderBy(orderFn(sortColumn)).limit(pageSize).offset(offset),
        db
          .select({
            total: drizzleSql`COALESCE(COUNT(${audienceMembers.id}), 0)`,
          })
          .from(audienceMembers)
          .innerJoin(
            creatorProfiles,
            eq(audienceMembers.creatorProfileId, creatorProfiles.id)
          )
          .innerJoin(users, eq(creatorProfiles.userId, users.id))
          .where(
            and(
              eq(users.clerkId, clerkUserId),
              eq(audienceMembers.creatorProfileId, profileId)
            )
          ),
      ]);

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
        lastSeenAt: member.lastSeenAt?.toISOString(),
        createdAt: member.createdAt?.toISOString(),
      }));

      return NextResponse.json(
        { members, total: Number(total ?? 0) },
        { status: 200 }
      );
    });
  } catch (error) {
    console.error('[Dashboard Audience] Failed to load members', error);
    return NextResponse.json(
      { error: 'Unable to load audience members' },
      { status: 500 }
    );
  }
}
