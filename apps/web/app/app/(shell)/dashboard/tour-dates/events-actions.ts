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
  | { ok: false; reason: 'unauthorized' };

interface AuthedProfile {
  userId: string;
  profileId: string;
}

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

export async function confirmEvent(id: string): Promise<EventActionResult> {
  noStore();
  const authed = await requireAuthedProfile();
  if (!authed) {
    return { ok: false, reason: 'unauthorized' };
  }

  const result = await db
    .update(tourDates)
    .set({
      confirmationStatus: 'confirmed',
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(eq(tourDates.id, id), eq(tourDates.profileId, authed.profileId))
    );

  if (result.rowCount === 0) {
    return { ok: false, reason: 'not_found' };
  }

  void trackServerEvent('event_confirmed', {
    profileId: authed.profileId,
    eventId: id,
  });

  invalidateEventsCache(authed);
  return { ok: true };
}

export async function rejectEvent(id: string): Promise<EventActionResult> {
  noStore();
  const authed = await requireAuthedProfile();
  if (!authed) {
    return { ok: false, reason: 'unauthorized' };
  }

  const result = await db
    .update(tourDates)
    .set({
      confirmationStatus: 'rejected',
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(eq(tourDates.id, id), eq(tourDates.profileId, authed.profileId))
    );

  if (result.rowCount === 0) {
    return { ok: false, reason: 'not_found' };
  }

  void trackServerEvent('event_rejected', {
    profileId: authed.profileId,
    eventId: id,
  });

  invalidateEventsCache(authed);
  return { ok: true };
}

export async function undoRejectEvent(id: string): Promise<EventActionResult> {
  noStore();
  const authed = await requireAuthedProfile();
  if (!authed) {
    return { ok: false, reason: 'unauthorized' };
  }

  const result = await db
    .update(tourDates)
    .set({
      confirmationStatus: 'pending',
      reviewedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tourDates.id, id),
        eq(tourDates.profileId, authed.profileId),
        eq(tourDates.confirmationStatus, 'rejected')
      )
    );

  if (result.rowCount === 0) {
    return { ok: false, reason: 'not_found' };
  }

  void trackServerEvent('event_reject_undone', {
    profileId: authed.profileId,
    eventId: id,
  });

  invalidateEventsCache(authed);
  return { ok: true };
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

  const result = await db
    .update(tourDates)
    .set({
      confirmationStatus: 'confirmed',
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(tourDates.id, [...ids]),
        eq(tourDates.profileId, authed.profileId)
      )
    );

  void trackServerEvent('events_confirmed_bulk', {
    profileId: authed.profileId,
    requested: ids.length,
    updated: result.rowCount ?? 0,
  });

  invalidateEventsCache(authed);
  return {
    ok: true,
    updated: result.rowCount ?? 0,
    requested: ids.length,
  };
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

  const result = await db
    .update(tourDates)
    .set({
      confirmationStatus: 'rejected',
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(tourDates.id, [...ids]),
        eq(tourDates.profileId, authed.profileId)
      )
    );

  void trackServerEvent('events_rejected_bulk', {
    profileId: authed.profileId,
    requested: ids.length,
    updated: result.rowCount ?? 0,
  });

  invalidateEventsCache(authed);
  return {
    ok: true,
    updated: result.rowCount ?? 0,
    requested: ids.length,
  };
}
