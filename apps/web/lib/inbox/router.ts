/**
 * Jovie Inbox assignment router.
 *
 * It records correspondence and its internal owner in Jovie Inbox. It never
 * forwards a user's personal email and never delivers mail to an external
 * provider. Provider integration remains a separate, explicit lane.
 */

import { and, eq } from 'drizzle-orm';
import { selectContactAssignment } from '@/lib/contacts/assignment-selection';
import { db } from '@/lib/db';
import { emailThreads } from '@/lib/db/schema/inbox';
import {
  creatorContactAssignments,
  creatorContactPeople,
  creatorContactResponsibilities,
} from '@/lib/db/schema/profiles';
import { logger } from '@/lib/utils/logger';
import { CATEGORY_TO_CONTACT_ROLE } from './constants';

interface RouteResult {
  success: boolean;
  routedToContactPersonId?: string;
  assignedToJovie?: boolean;
  error?: string;
}

/**
 * Confirms an Inbox category and records a deterministic internal assignment.
 * No external message is sent and no mailbox, DNS, or provider configuration
 * is performed here.
 */
export async function confirmAndRoute(
  threadId: string,
  category: string,
  territory: string | null
): Promise<RouteResult> {
  const [thread] = await db
    .select({
      id: emailThreads.id,
      creatorProfileId: emailThreads.creatorProfileId,
      isRead: emailThreads.isRead,
    })
    .from(emailThreads)
    .where(eq(emailThreads.id, threadId))
    .limit(1);
  if (!thread) return { success: false, error: 'Thread not found' };

  const role = CATEGORY_TO_CONTACT_ROLE[category];
  if (!role) {
    return { success: false, error: 'No responsibility for this category' };
  }

  const candidates = await db
    .select({
      personId: creatorContactPeople.id,
      displayName: creatorContactPeople.displayName,
      role: creatorContactResponsibilities.role,
      territories: creatorContactAssignments.territories,
      isPrimary: creatorContactAssignments.isPrimary,
      sortOrder: creatorContactAssignments.sortOrder,
    })
    .from(creatorContactAssignments)
    .innerJoin(
      creatorContactPeople,
      eq(creatorContactPeople.id, creatorContactAssignments.personId)
    )
    .innerJoin(
      creatorContactResponsibilities,
      eq(
        creatorContactResponsibilities.id,
        creatorContactAssignments.responsibilityId
      )
    )
    .where(
      and(
        eq(creatorContactPeople.creatorProfileId, thread.creatorProfileId),
        eq(creatorContactResponsibilities.role, role),
        eq(creatorContactAssignments.isActive, true)
      )
    );

  const match = selectContactAssignment(candidates, territory);
  const now = new Date();

  if (!match) {
    const assignedToJovie = role === 'management';
    await db
      .update(emailThreads)
      .set({
        category: category as (typeof emailThreads.category.enumValues)[number],
        territory,
        // Jovie is the visible default manager, but not a duplicate person row.
        status: assignedToJovie ? 'in_progress' : 'pending_review',
        routedToContactPersonId: null,
        routedAt: assignedToJovie ? now : null,
        updatedAt: now,
      })
      .where(eq(emailThreads.id, threadId));

    return assignedToJovie
      ? { success: true, assignedToJovie: true }
      : { success: false, error: 'No active responsibility assignment found' };
  }

  await db
    .update(emailThreads)
    .set({
      category: category as (typeof emailThreads.category.enumValues)[number],
      territory,
      status: 'routed',
      routedToContactPersonId: match.personId,
      routedAt: now,
      isRead: thread.isRead,
      updatedAt: now,
    })
    .where(eq(emailThreads.id, threadId));

  logger.info('Inbox thread assigned internally', {
    threadId,
    personId: match.personId,
    category,
    territory,
  });

  return { success: true, routedToContactPersonId: match.personId };
}
