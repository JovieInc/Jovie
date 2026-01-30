'use server';

import { and, asc, eq } from 'drizzle-orm';
import { unstable_noStore as noStore } from 'next/cache';
import { getCachedAuth } from '@/lib/auth/cached';
import { withDbSessionTx } from '@/lib/auth/session';
import { invalidateProfileCache } from '@/lib/cache/profile';
import { sanitizeContactInput } from '@/lib/contacts/validation';
import { type DbOrTransaction } from '@/lib/db';
import { creatorContacts, creatorProfiles, users } from '@/lib/db/schema';
import type { DashboardContact, DashboardContactInput } from '@/types/contacts';

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

async function assertProfileOwnership(
  tx: DbOrTransaction,
  profileId: string,
  clerkUserId: string
): Promise<{ id: string; username: string; usernameNormalized: string }> {
  const [profile] = await tx
    .select({
      id: creatorProfiles.id,
      username: creatorProfiles.username,
      usernameNormalized: creatorProfiles.usernameNormalized,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .where(
      and(eq(creatorProfiles.id, profileId), eq(users.clerkId, clerkUserId))
    )
    .limit(1);

  if (!profile) {
    throw new Error('Unauthorized to access this profile');
  }

  return profile;
}

export async function getProfileContactsForOwner(
  profileId: string
): Promise<DashboardContact[]> {
  noStore();
  const { userId } = await getCachedAuth();
  if (!userId) {
    throw new Error('Unauthorized');
  }

  return withDbSessionTx(async (tx, clerkUserId) => {
    await assertProfileOwnership(tx, profileId, clerkUserId);

    const rows = await tx
      .select()
      .from(creatorContacts)
      .where(eq(creatorContacts.creatorProfileId, profileId))
      .orderBy(asc(creatorContacts.sortOrder), asc(creatorContacts.createdAt));

    return rows.map(mapContact);
  });
}

export async function saveContact(
  input: DashboardContactInput
): Promise<DashboardContact> {
  noStore();
  const sanitized = sanitizeContactInput(input);

  return withDbSessionTx(async (tx, clerkUserId) => {
    const profile = await assertProfileOwnership(
      tx,
      sanitized.profileId,
      clerkUserId
    );

    const values = {
      creatorProfileId: sanitized.profileId,
      role: sanitized.role,
      customLabel: sanitized.customLabel,
      personName: sanitized.personName,
      companyName: sanitized.companyName,
      territories: sanitized.territories,
      email: sanitized.email,
      phone: sanitized.phone,
      preferredChannel: sanitized.preferredChannel,
      isActive: sanitized.isActive ?? true,
      sortOrder: sanitized.sortOrder ?? 0,
      updatedAt: new Date(),
    };

    let saved: typeof creatorContacts.$inferSelect | null = null;

    if (sanitized.id) {
      const [existing] = await tx
        .select({ id: creatorContacts.id })
        .from(creatorContacts)
        .where(
          and(
            eq(creatorContacts.id, sanitized.id),
            eq(creatorContacts.creatorProfileId, sanitized.profileId)
          )
        )
        .limit(1);

      if (!existing) {
        throw new Error('Contact not found');
      }

      [saved] = await tx
        .update(creatorContacts)
        .set(values)
        .where(eq(creatorContacts.id, sanitized.id))
        .returning();
    } else {
      [saved] = await tx
        .insert(creatorContacts)
        .values({
          ...values,
          createdAt: new Date(),
        })
        .returning();
    }

    if (!saved) {
      throw new Error('Unable to save contact');
    }

    // Use centralized cache invalidation
    await invalidateProfileCache(profile.usernameNormalized);

    return mapContact(saved);
  });
}

export async function deleteContact(
  contactId: string,
  profileId: string
): Promise<void> {
  noStore();
  const { userId } = await getCachedAuth();
  if (!userId) {
    throw new Error('Unauthorized');
  }

  await withDbSessionTx(async (tx, clerkUserId) => {
    const profile = await assertProfileOwnership(tx, profileId, clerkUserId);

    const [existing] = await tx
      .select({ id: creatorContacts.id })
      .from(creatorContacts)
      .where(
        and(
          eq(creatorContacts.id, contactId),
          eq(creatorContacts.creatorProfileId, profileId)
        )
      )
      .limit(1);

    if (!existing) {
      throw new Error('Contact not found');
    }

    await tx.delete(creatorContacts).where(eq(creatorContacts.id, contactId));

    // Use centralized cache invalidation
    await invalidateProfileCache(profile.usernameNormalized);
  });
}
