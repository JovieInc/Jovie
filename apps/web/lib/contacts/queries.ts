import { asc, eq } from 'drizzle-orm';
import { type DbOrTransaction } from '@/lib/db';
import {
  creatorContactAssignments,
  creatorContactPeople,
  creatorContactResponsibilities,
} from '@/lib/db/schema/profiles';
import type { DashboardContact } from '@/types/contacts';
import { toDashboardContacts } from './directory-records';

export async function getDashboardContacts(
  tx: DbOrTransaction,
  creatorProfileId: string
): Promise<DashboardContact[]> {
  const rows = await tx
    .select({
      person: {
        id: creatorContactPeople.id,
        creatorProfileId: creatorContactPeople.creatorProfileId,
        displayName: creatorContactPeople.displayName,
        companyName: creatorContactPeople.companyName,
        email: creatorContactPeople.email,
        phone: creatorContactPeople.phone,
        preferredChannel: creatorContactPeople.preferredChannel,
      },
      assignment: {
        id: creatorContactAssignments.id,
        territories: creatorContactAssignments.territories,
        isActive: creatorContactAssignments.isActive,
        isPrimary: creatorContactAssignments.isPrimary,
        sortOrder: creatorContactAssignments.sortOrder,
        startedAt: creatorContactAssignments.startedAt,
        endedAt: creatorContactAssignments.endedAt,
      },
      responsibility: {
        role: creatorContactResponsibilities.role,
        customLabel: creatorContactResponsibilities.customLabel,
      },
    })
    .from(creatorContactPeople)
    .leftJoin(
      creatorContactAssignments,
      eq(creatorContactAssignments.personId, creatorContactPeople.id)
    )
    .leftJoin(
      creatorContactResponsibilities,
      eq(
        creatorContactResponsibilities.id,
        creatorContactAssignments.responsibilityId
      )
    )
    .where(eq(creatorContactPeople.creatorProfileId, creatorProfileId))
    .orderBy(
      asc(creatorContactAssignments.sortOrder),
      asc(creatorContactAssignments.createdAt),
      asc(creatorContactPeople.id)
    );

  return toDashboardContacts(rows, creatorProfileId);
}
