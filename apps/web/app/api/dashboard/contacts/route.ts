import { and, asc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getCachedAuth } from '@/lib/auth/cached';
import { withDbSessionTx } from '@/lib/auth/session';
import { users } from '@/lib/db/schema/auth';
import { creatorContacts, creatorProfiles } from '@/lib/db/schema/profiles';
import type { DashboardContact } from '@/types/contacts';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
} as const;

function mapContact(
  row: typeof creatorContacts.$inferSelect
): DashboardContact {
  return {
    id: row.id,
    creatorProfileId: row.creatorProfileId,
    role: row.role,
    customLabel: row.customLabel,
    personName: row.personName,
    companyName: row.companyName,
    territories: row.territories ?? [],
    email: row.email,
    phone: row.phone,
    preferredChannel: row.preferredChannel,
    isActive: row.isActive ?? true,
    sortOrder: row.sortOrder ?? 0,
  };
}

export async function GET(req: Request) {
  try {
    const { userId } = await getCachedAuth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const { searchParams } = new URL(req.url);
    const profileId = searchParams.get('profileId');

    if (!profileId) {
      return NextResponse.json(
        { error: 'Missing profileId' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const contacts = await withDbSessionTx(
      async (tx, clerkUserId) => {
        const [profile] = await tx
          .select({ id: creatorProfiles.id })
          .from(creatorProfiles)
          .innerJoin(users, eq(users.id, creatorProfiles.userId))
          .where(
            and(
              eq(creatorProfiles.id, profileId),
              eq(users.clerkId, clerkUserId)
            )
          )
          .limit(1);

        if (!profile) {
          return null;
        }

        const rows = await tx
          .select()
          .from(creatorContacts)
          .where(eq(creatorContacts.creatorProfileId, profileId))
          .orderBy(
            asc(creatorContacts.sortOrder),
            asc(creatorContacts.createdAt)
          );

        return rows.map(mapContact);
      },
      { clerkUserId: userId }
    );

    if (!contacts) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(contacts, { headers: NO_STORE_HEADERS });
  } catch {
    return NextResponse.json(
      { error: 'Failed to load contacts' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
