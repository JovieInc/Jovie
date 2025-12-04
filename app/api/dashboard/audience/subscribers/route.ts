import { and, asc, desc, sql as drizzleSql, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withDbSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  creatorProfiles,
  notificationSubscriptions,
  users,
} from '@/lib/db/schema';

const SORTABLE_COLUMNS = {
  email: notificationSubscriptions.email,
  phone: notificationSubscriptions.phone,
  country: notificationSubscriptions.countryCode,
  createdAt: notificationSubscriptions.createdAt,
} as const;

const querySchema = z.object({
  profileId: z.string().uuid(),
  sort: z.enum(['email', 'phone', 'country', 'createdAt']).default('createdAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  page: z.preprocess(val => Number(val ?? 1), z.number().int().min(1)),
  pageSize: z.preprocess(
    val => Number(val ?? 10),
    z.number().int().min(1).max(100)
  ),
});

export async function GET(request: Request) {
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
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
      }

      const { profileId, sort, direction, page, pageSize } = parsed.data;
      const sortColumn = SORTABLE_COLUMNS[sort];
      const orderFn = direction === 'asc' ? asc : desc;
      const offset = (page - 1) * pageSize;

      const baseQuery = db
        .select({
          id: notificationSubscriptions.id,
          email: notificationSubscriptions.email,
          phone: notificationSubscriptions.phone,
          countryCode: notificationSubscriptions.countryCode,
          createdAt: notificationSubscriptions.createdAt,
          channel: notificationSubscriptions.channel,
        })
        .from(notificationSubscriptions)
        .innerJoin(
          creatorProfiles,
          eq(notificationSubscriptions.creatorProfileId, creatorProfiles.id)
        )
        .innerJoin(users, eq(creatorProfiles.userId, users.id))
        .where(
          and(
            eq(users.clerkId, clerkUserId),
            eq(notificationSubscriptions.creatorProfileId, profileId)
          )
        );

      const [rows, [{ total }]] = await Promise.all([
        baseQuery.orderBy(orderFn(sortColumn)).limit(pageSize).offset(offset),
        db
          .select({
            total: drizzleSql`COALESCE(COUNT(${notificationSubscriptions.id}), 0)`,
          })
          .from(notificationSubscriptions)
          .innerJoin(
            creatorProfiles,
            eq(notificationSubscriptions.creatorProfileId, creatorProfiles.id)
          )
          .innerJoin(users, eq(creatorProfiles.userId, users.id))
          .where(
            and(
              eq(users.clerkId, clerkUserId),
              eq(notificationSubscriptions.creatorProfileId, profileId)
            )
          ),
      ]);

      return NextResponse.json(
        { subscribers: rows, total: Number(total ?? 0) },
        { status: 200 }
      );
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('Error fetching notification subscribers', error);
    return NextResponse.json(
      { error: 'Failed to load subscribers' },
      { status: 500 }
    );
  }
}
