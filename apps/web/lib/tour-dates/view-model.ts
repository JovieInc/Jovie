import type { TourDate } from '@/lib/db/schema/tour';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { toISOStringSafe } from '@/lib/utils/date';

export function mapTourDateToViewModel(tourDate: TourDate): TourDateViewModel {
  return {
    id: tourDate.id,
    profileId: tourDate.profileId,
    externalId: tourDate.externalId,
    provider: tourDate.provider,
    eventType: tourDate.eventType,
    confirmationStatus: tourDate.confirmationStatus,
    reviewedAt: tourDate.reviewedAt
      ? toISOStringSafe(tourDate.reviewedAt)
      : null,
    title: tourDate.title,
    startDate: toISOStringSafe(tourDate.startDate),
    startTime: tourDate.startTime,
    timezone: tourDate.timezone,
    venueName: tourDate.venueName,
    city: tourDate.city,
    region: tourDate.region,
    country: tourDate.country,
    latitude: tourDate.latitude,
    longitude: tourDate.longitude,
    ticketUrl: tourDate.ticketUrl,
    ticketStatus: tourDate.ticketStatus,
    lastSyncedAt: tourDate.lastSyncedAt
      ? toISOStringSafe(tourDate.lastSyncedAt)
      : null,
    createdAt: toISOStringSafe(tourDate.createdAt),
    updatedAt: toISOStringSafe(tourDate.updatedAt),
  };
}
