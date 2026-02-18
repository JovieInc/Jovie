'use server';

import { and, eq, gte } from 'drizzle-orm';
import {
  unstable_noStore as noStore,
  revalidatePath,
  revalidateTag,
  unstable_cache,
} from 'next/cache';
import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { type TourDate, tourDates } from '@/lib/db/schema/tour';
import { trackServerEvent } from '@/lib/server-analytics';
import { getDashboardData } from '../actions';
import {
  mapTourDateToViewModel,
  type TourDateViewModel,
  validateTicketUrl,
} from './types';

export {
  checkBandsintownConnection,
  connectBandsintownArtist,
  disconnectBandsintown,
  removeBandsintownApiKey,
  saveBandsintownApiKey,
  syncFromBandsintown,
} from './bandsintown';
// Re-export types and Bandsintown actions for backwards compatibility
export type { BandsintownConnectionStatus, TourDateViewModel } from './types';

// ============================================================================
// Helpers
// ============================================================================

async function requireProfile(): Promise<{
  id: string;
  handle: string;
}> {
  const data = await getDashboardData();

  if (data.needsOnboarding) {
    redirect('/onboarding');
  }

  if (!data.selectedProfile) {
    throw new TypeError('Missing creator profile');
  }

  return {
    id: data.selectedProfile.id,
    handle:
      data.selectedProfile.usernameNormalized ?? data.selectedProfile.username,
  };
}

// ============================================================================
// Server Actions — CRUD
// ============================================================================

/**
 * Core tour dates fetch logic (cacheable)
 */
async function fetchTourDatesCore(
  profileId: string
): Promise<TourDateViewModel[]> {
  const dates = await db
    .select()
    .from(tourDates)
    .where(eq(tourDates.profileId, profileId))
    .orderBy(tourDates.startDate);

  return dates.map(mapTourDateToViewModel);
}

/**
 * Load tour dates for the current profile with caching (30s TTL)
 * Cache is invalidated on mutations (create, update, delete, sync)
 */
export async function loadTourDates(): Promise<TourDateViewModel[]> {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect(`/sign-in?redirect_url=${APP_ROUTES.SETTINGS_TOURING}`);
  }

  const profile = await requireProfile();

  return unstable_cache(
    () => fetchTourDatesCore(profile.id),
    ['tour-dates', userId, profile.id],
    {
      revalidate: 30,
      tags: [`tour-dates:${userId}:${profile.id}`],
    }
  )();
}

/**
 * Load upcoming tour dates only (for public display)
 */
export async function loadUpcomingTourDates(
  profileId: string
): Promise<TourDateViewModel[]> {
  noStore();

  const now = new Date();
  const dates = await db
    .select()
    .from(tourDates)
    .where(
      and(eq(tourDates.profileId, profileId), gte(tourDates.startDate, now))
    )
    .orderBy(tourDates.startDate);

  return dates.map(mapTourDateToViewModel);
}

/**
 * Create a manual tour date
 */
export async function createTourDate(params: {
  title?: string;
  startDate: string;
  startTime?: string;
  timezone?: string;
  venueName: string;
  city: string;
  region?: string;
  country: string;
  ticketUrl?: string;
  ticketStatus?: 'available' | 'sold_out' | 'cancelled';
}): Promise<TourDateViewModel> {
  noStore();
  const { userId } = await getCachedAuth();

  if (!userId) {
    throw new TypeError('Unauthorized');
  }

  const profile = await requireProfile();

  const parsedStartDate = new Date(params.startDate);
  if (Number.isNaN(parsedStartDate.getTime())) {
    throw new SyntaxError('Invalid start date');
  }

  validateTicketUrl(params.ticketUrl);

  const [created] = await db
    .insert(tourDates)
    .values({
      profileId: profile.id,
      provider: 'manual',
      title: params.title ?? null,
      startDate: parsedStartDate,
      startTime: params.startTime ?? null,
      timezone: params.timezone ?? null,
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

  revalidateTag(`tour-dates:${userId}:${profile.id}`, 'max');
  revalidatePath(APP_ROUTES.SETTINGS_TOURING);

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
  timezone?: string | null;
  venueName?: string;
  city?: string;
  region?: string | null;
  country?: string;
  ticketUrl?: string | null;
  ticketStatus?: 'available' | 'sold_out' | 'cancelled';
}): Promise<TourDateViewModel> {
  noStore();
  const { userId } = await getCachedAuth();

  if (!userId) {
    throw new TypeError('Unauthorized');
  }

  const profile = await requireProfile();

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
  if (params.timezone !== undefined) updateData.timezone = params.timezone;
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

  revalidateTag(`tour-dates:${userId}:${profile.id}`, 'max');
  revalidatePath(APP_ROUTES.SETTINGS_TOURING);

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

  revalidateTag(`tour-dates:${userId}:${profile.id}`, 'max');
  revalidatePath(APP_ROUTES.SETTINGS_TOURING);

  return { success: true };
}
