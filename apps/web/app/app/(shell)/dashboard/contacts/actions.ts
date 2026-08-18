'use server';

import { and, sql as drizzleSql, eq, notInArray } from 'drizzle-orm';
import {
  unstable_noStore as noStore,
  revalidateTag,
  unstable_cache,
} from 'next/cache';
import { cache } from 'react';
import { getCachedAuth } from '@/lib/auth/cached';
import { withDbSessionTx } from '@/lib/auth/session';
import { invalidateProfileCache } from '@/lib/cache/profile';
import { getDashboardContacts } from '@/lib/contacts/queries';
import { sanitizeContactInput } from '@/lib/contacts/validation';
import { type DbOrTransaction } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import {
  creatorContactAssignments,
  creatorContactPeople,
  creatorContactResponsibilities,
  creatorContacts,
  creatorProfiles,
} from '@/lib/db/schema/profiles';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import type { DashboardContact, DashboardContactInput } from '@/types/contacts';

class ContactLimitError extends Error {
  constructor(
    public readonly limit: number,
    public readonly currentCount: number
  ) {
    super(
      `Contact limit reached: ${currentCount}/${limit}. Upgrade your plan for unlimited contacts.`
    );
    this.name = 'ContactLimitError';
  }
}

async function assertProfileOwnership(
  tx: DbOrTransaction,
  profileId: string,
  userId: string
): Promise<{ id: string; username: string; usernameNormalized: string }> {
  const [profile] = await tx
    .select({
      id: creatorProfiles.id,
      username: creatorProfiles.username,
      usernameNormalized: creatorProfiles.usernameNormalized,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .where(and(eq(creatorProfiles.id, profileId), eq(users.id, userId)))
    .limit(1);

  if (!profile) {
    throw new Error('Unauthorized to access this profile');
  }

  return profile;
}

async function fetchContactsCore(
  profileId: string,
  userId: string
): Promise<DashboardContact[]> {
  return withDbSessionTx(
    async (tx, sessionUserId) => {
      await assertProfileOwnership(tx, profileId, sessionUserId);
      return getDashboardContacts(tx, profileId);
    },
    { clerkUserId: userId }
  );
}

async function resolveProfileContactsForOwner(
  profileId: string
): Promise<DashboardContact[]> {
  const { userId } = await getCachedAuth();
  if (!userId) {
    throw new Error('Unauthorized');
  }

  return unstable_cache(
    () => fetchContactsCore(profileId, userId),
    ['contacts', userId, profileId],
    {
      revalidate: 30,
      tags: [`contacts:${userId}:${profileId}`],
    }
  )();
}

export const getProfileContactsForOwner = cache(resolveProfileContactsForOwner);

function responsibilityKey(role: string, customLabel: string | null): string {
  return `${role}:${customLabel ?? ''}`;
}

export async function saveContact(
  input: DashboardContactInput
): Promise<DashboardContact> {
  noStore();
  const { userId } = await getCachedAuth();
  if (!userId) {
    throw new Error('Unauthorized');
  }

  const sanitized = sanitizeContactInput(input);
  const responsibilities = sanitized.responsibilities ?? [];
  // Older clients can submit the legacy single-role shape. Only a client that
  // supplied the full assignment snapshot may retire missing assignments.
  const shouldDeactivateMissingAssignments =
    Array.isArray(input.responsibilities) && input.responsibilities.length > 0;
  // Entitlements can consult billing/auth infrastructure; resolve them before
  // opening the database transaction so the write path stays bounded to DB work.
  let entitlement: Awaited<
    ReturnType<typeof getCurrentUserEntitlements>
  > | null = null;
  if (!sanitized.id) {
    try {
      entitlement = await getCurrentUserEntitlements();
    } catch {
      // A billing outage must not prevent an otherwise valid directory save.
      // The entitlement service normally degrades to free tier itself; this is
      // the final safety net for an unexpected infrastructure failure.
      entitlement = null;
    }
  }

  const result = await withDbSessionTx(
    async (tx, sessionUserId) => {
      const profile = await assertProfileOwnership(
        tx,
        sanitized.profileId,
        sessionUserId
      );
      const now = new Date();

      let personId = sanitized.id;
      if (personId) {
        const [existingPerson] = await tx
          .select({ id: creatorContactPeople.id })
          .from(creatorContactPeople)
          .where(
            and(
              eq(creatorContactPeople.id, personId),
              eq(creatorContactPeople.creatorProfileId, sanitized.profileId)
            )
          )
          .limit(1);
        if (!existingPerson) {
          throw new Error('Contact not found');
        }

        await tx
          .update(creatorContactPeople)
          .set({
            displayName: sanitized.personName,
            companyName: sanitized.companyName,
            email: sanitized.email,
            phone: sanitized.phone,
            preferredChannel: sanitized.preferredChannel,
            updatedAt: now,
          })
          .where(eq(creatorContactPeople.id, personId));
      } else {
        const [{ count: currentCount }] = await tx
          .select({ count: drizzleSql<number>`count(*)::int` })
          .from(creatorContactPeople)
          .where(
            eq(creatorContactPeople.creatorProfileId, sanitized.profileId)
          );

        if (
          entitlement?.contactsLimit !== null &&
          entitlement?.contactsLimit !== undefined &&
          currentCount >= entitlement.contactsLimit
        ) {
          throw new ContactLimitError(entitlement.contactsLimit, currentCount);
        }

        const [person] = await tx
          .insert(creatorContactPeople)
          .values({
            creatorProfileId: sanitized.profileId,
            displayName: sanitized.personName,
            companyName: sanitized.companyName,
            email: sanitized.email,
            phone: sanitized.phone,
            preferredChannel: sanitized.preferredChannel,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: creatorContactPeople.id });
        personId = person?.id;
      }

      if (!personId) {
        throw new Error('Unable to save contact');
      }

      const existingResponsibilities = await tx
        .select({
          id: creatorContactResponsibilities.id,
          role: creatorContactResponsibilities.role,
          customLabel: creatorContactResponsibilities.customLabel,
        })
        .from(creatorContactResponsibilities)
        .where(
          eq(
            creatorContactResponsibilities.creatorProfileId,
            sanitized.profileId
          )
        );
      const existingByKey = new Map(
        existingResponsibilities.map(responsibility => [
          responsibilityKey(
            responsibility.role,
            responsibility.customLabel || null
          ),
          responsibility,
        ])
      );
      const missingResponsibilities = responsibilities.filter(
        responsibility =>
          !existingByKey.has(
            responsibilityKey(
              responsibility.role,
              responsibility.customLabel ?? null
            )
          )
      );

      if (missingResponsibilities.length > 0) {
        await tx.insert(creatorContactResponsibilities).values(
          missingResponsibilities.map(responsibility => ({
            creatorProfileId: sanitized.profileId,
            role: responsibility.role,
            customLabel: responsibility.customLabel ?? '',
            createdAt: now,
            updatedAt: now,
          }))
        );
      }

      const allResponsibilities = await tx
        .select({
          id: creatorContactResponsibilities.id,
          role: creatorContactResponsibilities.role,
          customLabel: creatorContactResponsibilities.customLabel,
        })
        .from(creatorContactResponsibilities)
        .where(
          eq(
            creatorContactResponsibilities.creatorProfileId,
            sanitized.profileId
          )
        );
      const responsibilityIds = new Map(
        allResponsibilities.map(responsibility => [
          responsibilityKey(
            responsibility.role,
            responsibility.customLabel || null
          ),
          responsibility.id,
        ])
      );

      const assignmentValues = responsibilities.map(responsibility => {
        const responsibilityId = responsibilityIds.get(
          responsibilityKey(
            responsibility.role,
            responsibility.customLabel ?? null
          )
        );
        if (!responsibilityId) {
          throw new Error('Unable to resolve contact responsibility');
        }

        return {
          personId,
          responsibilityId,
          territories: responsibility.territories ?? [],
          isActive: responsibility.isActive ?? true,
          isPrimary: responsibility.isPrimary ?? false,
          sortOrder: responsibility.sortOrder ?? 0,
          startedAt: responsibility.startedAt
            ? new Date(responsibility.startedAt)
            : now,
          endedAt:
            responsibility.isActive === false
              ? responsibility.endedAt
                ? new Date(responsibility.endedAt)
                : now
              : null,
          createdAt: now,
          updatedAt: now,
        };
      });

      await tx
        .insert(creatorContactAssignments)
        .values(assignmentValues)
        .onConflictDoUpdate({
          target: [
            creatorContactAssignments.personId,
            creatorContactAssignments.responsibilityId,
          ],
          set: {
            territories: drizzleSql`excluded.territories`,
            isActive: drizzleSql`excluded.is_active`,
            isPrimary: drizzleSql`excluded.is_primary`,
            sortOrder: drizzleSql`excluded.sort_order`,
            startedAt: drizzleSql`excluded.started_at`,
            endedAt: drizzleSql`excluded.ended_at`,
            updatedAt: now,
          },
        });

      const assignedResponsibilityIds = assignmentValues.map(
        assignment => assignment.responsibilityId
      );
      if (
        shouldDeactivateMissingAssignments &&
        assignedResponsibilityIds.length > 0
      ) {
        await tx
          .update(creatorContactAssignments)
          .set({
            isActive: false,
            isPrimary: false,
            endedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(creatorContactAssignments.personId, personId),
              notInArray(
                creatorContactAssignments.responsibilityId,
                assignedResponsibilityIds
              )
            )
          );
      }

      const contacts = await getDashboardContacts(tx, sanitized.profileId);
      const saved = contacts.find(contact => contact.id === personId);
      if (!saved) {
        throw new Error('Unable to load saved contact');
      }

      return { saved, usernameNormalized: profile.usernameNormalized };
    },
    { clerkUserId: userId }
  );

  revalidateTag(`contacts:${userId}:${sanitized.profileId}`, 'max');
  await invalidateProfileCache(result.usernameNormalized);
  return result.saved;
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

  const usernameNormalized = await withDbSessionTx(
    async (tx, sessionUserId) => {
      const profile = await assertProfileOwnership(
        tx,
        profileId,
        sessionUserId
      );
      const [person] = await tx
        .select({ id: creatorContactPeople.id })
        .from(creatorContactPeople)
        .where(
          and(
            eq(creatorContactPeople.id, contactId),
            eq(creatorContactPeople.creatorProfileId, profileId)
          )
        )
        .limit(1);
      if (!person) {
        throw new Error('Contact not found');
      }

      await tx
        .delete(creatorContactPeople)
        .where(eq(creatorContactPeople.id, contactId));
      // Backfilled people share the legacy UUID. Delete a legacy record only
      // when the creator explicitly removes the corresponding person.
      await tx
        .delete(creatorContacts)
        .where(
          and(
            eq(creatorContacts.id, contactId),
            eq(creatorContacts.creatorProfileId, profileId)
          )
        );
      return profile.usernameNormalized;
    },
    { clerkUserId: userId }
  );

  revalidateTag(`contacts:${userId}:${profileId}`, 'max');
  await invalidateProfileCache(usernameNormalized);
}
