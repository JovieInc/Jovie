'use server';

import { and, eq, inArray } from 'drizzle-orm';
import { unstable_noStore as noStore, revalidateTag } from 'next/cache';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { tourDates } from '@/lib/db/schema/tour';
import { trackServerEvent } from '@/lib/server-analytics';
import { getDashboardData } from '../actions';

/**
 * Trust-gate server actions for events. Confirm, reject, and undo-reject —
 * with bulk siblings for the admin batch-import workflow.
 *
 * Auth: each action issues an UPDATE with explicit `profileId` guard. There
 * is no Postgres RLS on `tour_dates`, so the WHERE-clause guard is the
 * authoritative check. An attacker passing another creator's event id gets
 * zero rows updated and a `not_found` result — no profile-existence side
 * channel.
 *
 * Cache invalidation: each action `revalidateTag`s the per-creator
 * tour-dates cache so the next server fetch is fresh. The TanStack Query
 * client on the calendar page invalidates its own `events.list(profileId)`
 * key in the mutation hook.
 */

export type EventActionResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'unauthorized' };

export type BulkEventActionResult =
  | { ok: true; updated: number; requested: number }
  | { ok: false; reason: 'not_found' | 'unauthorized' };

interface AuthedProfile {
  userId: string;
  profileId: string;
}

type ModerationStatus = 'confirmed' | 'pending' | 'rejected';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireAuthedProfile(): Promise<AuthedProfile | null> {
  const { userId } = await getCachedAuth();
  if (!userId) {
    return null;
  }
  const data = await getDashboardData();
  if (data.needsOnboarding && !data.dashboardLoadError) {
    return null;
  }
  if (!data.selectedProfile) {
    return null;
  }
  return { userId, profileId: data.selectedProfile.id };
}

function invalidateEventsCache(authed: AuthedProfile): void {
  revalidateTag(`tour-dates:${authed.userId}:${authed.profileId}`, 'max');
}

function isValidEventId(id: string): boolean {
  return UUID_REGEX.test(id);
}

function allEventIdsAreValid(ids: ReadonlyArray<string>): boolean {
  return ids.every(isValidEventId);
}

function affectedRows(result: { rowCount?: number | null }): number {
  return result.rowCount ?? 0;
}

async function updateEventModerationStatus({
  id,
  authed,
  status,
  trackingEvent,
  requireRejected,
}: {
  readonly id: string;
  readonly authed: AuthedProfile;
  readonly status: ModerationStatus;
  readonly trackingEvent: string;
  readonly requireRejected?: boolean;
}): Promise<EventActionResult> {
  if (!isValidEventId(id)) {
    return { ok: false, reason: 'not_found' };
  }

  const result = await db
    .update(tourDates)
    .set({
      confirmationStatus: status,
      reviewedAt: status === 'pending' ? null : new Date(),
      updatedAt: new Date(),
    })
    .where(
      requireRejected
        ? and(
            eq(tourDates.id, id),
            eq(tourDates.profileId, authed.profileId),
            eq(tourDates.confirmationStatus, 'rejected')
          )
        : and(eq(tourDates.id, id), eq(tourDates.profileId, authed.profileId))
    );

  if (affectedRows(result) === 0) {
    return { ok: false, reason: 'not_found' };
  }

  void trackServerEvent(trackingEvent, {
    profileId: authed.profileId,
    eventId: id,
  });

  invalidateEventsCache(authed);
  return { ok: true };
}

async function updateBulkEventModerationStatus({
  ids,
  authed,
  status,
  trackingEvent,
}: {
  readonly ids: ReadonlyArray<string>;
  readonly authed: AuthedProfile;
  readonly status: 'confirmed' | 'rejected';
  readonly trackingEvent: string;
}): Promise<BulkEventActionResult> {
  if (!allEventIdsAreValid(ids)) {
    return { ok: false, reason: 'not_found' };
  }

  const result = await db
    .update(tourDates)
    .set({
      confirmationStatus: status,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(tourDates.id, [...ids]),
        eq(tourDates.profileId, authed.profileId)
      )
    );
  const updated = affectedRows(result);

  if (updated !== ids.length) {
    return { ok: false, reason: 'not_found' };
  }

  void trackServerEvent(trackingEvent, {
    profileId: authed.profileId,
    requested: ids.length,
    updated,
  });

  invalidateEventsCache(authed);
  return {
    ok: true,
    updated,
    requested: ids.length,
  };
}

export async function confirmEvent(id: string): Promise<EventActionResult> {
  noStore();
  const authed = await requireAuthedProfile();
  if (!authed) {
    return { ok: false, reason: 'unauthorized' };
  }

  return updateEventModerationStatus({
    id,
    authed,
    status: 'confirmed',
    trackingEvent: 'event_confirmed',
  });
}

export async function rejectEvent(id: string): Promise<EventActionResult> {
  noStore();
  const authed = await requireAuthedProfile();
  if (!authed) {
    return { ok: false, reason: 'unauthorized' };
  }

  return updateEventModerationStatus({
    id,
    authed,
    status: 'rejected',
    trackingEvent: 'event_rejected',
  });
}

export async function undoRejectEvent(id: string): Promise<EventActionResult> {
  noStore();
  const authed = await requireAuthedProfile();
  if (!authed) {
    return { ok: false, reason: 'unauthorized' };
  }

  return updateEventModerationStatus({
    id,
    authed,
    status: 'pending',
    trackingEvent: 'event_reject_undone',
    requireRejected: true,
  });
}

export async function confirmEvents(
  ids: ReadonlyArray<string>
): Promise<BulkEventActionResult> {
  noStore();
  if (ids.length === 0) {
    return { ok: true, updated: 0, requested: 0 };
  }
  const authed = await requireAuthedProfile();
  if (!authed) {
    return { ok: false, reason: 'unauthorized' };
  }

  return updateBulkEventModerationStatus({
    ids,
    authed,
    status: 'confirmed',
    trackingEvent: 'events_confirmed_bulk',
  });
}

export async function rejectEvents(
  ids: ReadonlyArray<string>
): Promise<BulkEventActionResult> {
  noStore();
  if (ids.length === 0) {
    return { ok: true, updated: 0, requested: 0 };
  }
  const authed = await requireAuthedProfile();
  if (!authed) {
    return { ok: false, reason: 'unauthorized' };
  }

  return updateBulkEventModerationStatus({
    ids,
    authed,
    status: 'rejected',
    trackingEvent: 'events_rejected_bulk',
  });
}
