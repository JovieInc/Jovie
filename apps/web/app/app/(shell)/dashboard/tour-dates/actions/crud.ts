'use server';

import { and, eq } from 'drizzle-orm';
import {
  unstable_noStore as noStore,
  revalidatePath,
  revalidateTag,
} from 'next/cache';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { type TourDate, tourDates } from '@/lib/db/schema';
import { trackServerEvent } from '@/lib/server-analytics';
import {
  mapTourDateToViewModel,
  requireProfile,
  validateTicketUrl,
} from './helpers';
import type { TicketStatus, TourDateViewModel } from './types';

/**
 * Create a manual tour date
 */
export async function createTourDate(params: {
  title?: string;
  startDate: string;
  startTime?: string;
  venueName: string;
  city: string;
  region?: string;
  country: string;
  ticketUrl?: string;
  ticketStatus?: TicketStatus;
}): Promise<TourDateViewModel> {
  noStore();
  const { userId } = await getCachedAuth();

  if (!userId) {
    throw new TypeError('Unauthorized');
  }

  const profile = await requireProfile();

  // Validate startDate
  const parsedStartDate = new Date(params.startDate);
  if (Number.isNaN(parsedStartDate.getTime())) {
    throw new SyntaxError('Invalid start date');
  }

  // Validate ticketUrl if provided
  validateTicketUrl(params.ticketUrl);

  const [created] = await db
    .insert(tourDates)
    .values({
      profileId: profile.id,
      provider: 'manual',
      title: params.title ?? null,
      startDate: parsedStartDate,
      startTime: params.startTime ?? null,
      venueName: params.venueName,
      city: params.city,
      region: params.region ?? null,
      country: params.country,
      ticketUrl: params.ticketUrl ?? null,
      ticketStatus: params.ticketStatus ?? 'available',
    })
    .returning();

  void trackServerEvent('tour_date_created', {
    profileId: profile.id,
    tourDateId: created.id,
    source: 'manual',
  });

  // Invalidate cache and revalidate path
  revalidateTag(`tour-dates:${userId}:${profile.id}`, 'max');
  revalidatePath('/app/dashboard/tour-dates');

  return mapTourDateToViewModel(created);
}

/**
 * Update a tour date
 */
export async function updateTourDate(params: {
  id: string;
  title?: string | null;
  startDate?: string;
  startTime?: string | null;
  venueName?: string;
  city?: string;
  region?: string | null;
  country?: string;
  ticketUrl?: string | null;
  ticketStatus?: TicketStatus;
}): Promise<TourDateViewModel> {
  noStore();
  const { userId } = await getCachedAuth();

  if (!userId) {
    throw new TypeError('Unauthorized');
  }

  const profile = await requireProfile();

  // Verify ownership
  const [existing] = await db
    .select()
    .from(tourDates)
    .where(
      and(eq(tourDates.id, params.id), eq(tourDates.profileId, profile.id))
    )
    .limit(1);

  if (!existing) {
    throw new TypeError('Tour date not found');
  }

  const updateData: Partial<TourDate> = {
    updatedAt: new Date(),
  };

  if (params.title !== undefined) updateData.title = params.title;
  if (params.startDate !== undefined) {
    const parsedStartDate = new Date(params.startDate);
    if (Number.isNaN(parsedStartDate.getTime())) {
      throw new SyntaxError('Invalid start date');
    }
    updateData.startDate = parsedStartDate;
  }
  if (params.startTime !== undefined) updateData.startTime = params.startTime;
  if (params.venueName !== undefined) updateData.venueName = params.venueName;
  if (params.city !== undefined) updateData.city = params.city;
  if (params.region !== undefined) updateData.region = params.region;
  if (params.country !== undefined) updateData.country = params.country;
  if (params.ticketUrl !== undefined) {
    validateTicketUrl(params.ticketUrl);
    updateData.ticketUrl = params.ticketUrl;
  }
  if (params.ticketStatus !== undefined)
    updateData.ticketStatus = params.ticketStatus;

  const [updated] = await db
    .update(tourDates)
    .set(updateData)
    .where(eq(tourDates.id, params.id))
    .returning();

  if (!updated) {
    throw new TypeError('Tour date not found');
  }

  // Invalidate cache and revalidate path
  revalidateTag(`tour-dates:${userId}:${profile.id}`, 'max');
  revalidatePath('/app/dashboard/tour-dates');

  return mapTourDateToViewModel(updated);
}

/**
 * Delete a tour date
 */
export async function deleteTourDate(
  id: string
): Promise<{ success: boolean }> {
  noStore();
  const { userId } = await getCachedAuth();

  if (!userId) {
    throw new TypeError('Unauthorized');
  }

  const profile = await requireProfile();

  // Verify ownership and delete
  const result = await db
    .delete(tourDates)
    .where(and(eq(tourDates.id, id), eq(tourDates.profileId, profile.id)));

  if (result.rowCount === 0) {
    throw new TypeError('Tour date not found');
  }

  void trackServerEvent('tour_date_deleted', {
    profileId: profile.id,
    tourDateId: id,
  });

  // Invalidate cache and revalidate path
  revalidateTag(`tour-dates:${userId}:${profile.id}`, 'max');
  revalidatePath('/app/dashboard/tour-dates');

  return { success: true };
}
