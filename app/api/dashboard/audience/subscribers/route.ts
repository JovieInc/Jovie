import { and, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withDbSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  creatorProfiles,
  notificationSubscriptions,
  users,
} from '@/lib/db/schema';

const querySchema = z.object({
  profileId: z.string().uuid(),
});

export async function GET(request: Request) {
  try {
    return await withDbSession(async clerkUserId => {
      const { searchParams } = new URL(request.url);
      const parsed = querySchema.safeParse({
        profileId: searchParams.get('profileId'),
      });

      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid profile id' },
          { status: 400 }
        );
      }

      const rows = await db
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
            eq(
              notificationSubscriptions.creatorProfileId,
              parsed.data.profileId
            )
          )
        )
        .orderBy(desc(notificationSubscriptions.createdAt));

      return NextResponse.json({ subscribers: rows }, { status: 200 });
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
