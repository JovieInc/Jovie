import type { TourDate } from '@/lib/db/schema/tour';
import { toISOStringSafe } from '@/lib/utils/date';

// ============================================================================
// Types
// ============================================================================

type TicketStatus = 'available' | 'sold_out' | 'cancelled';

export interface TourDateViewModel {
  id: string;
  profileId: string;
  externalId: string | null;
  provider: 'bandsintown' | 'songkick' | 'manual';
  title: string | null;
  startDate: string;
  startTime: string | null;
  timezone: string | null;
  venueName: string;
  city: string;
  region: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  ticketUrl: string | null;
  ticketStatus: TicketStatus;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BandsintownConnectionStatus {
  connected: boolean;
  artistName: string | null;
  lastSyncedAt: string | null;
  hasApiKey: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

export function mapTourDateToViewModel(tourDate: TourDate): TourDateViewModel {
  return {
    id: tourDate.id,
    profileId: tourDate.profileId,
    externalId: tourDate.externalId,
    provider: tourDate.provider,
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

/**
 * Validate ticket URL (must be http or https)
 */
export function validateTicketUrl(ticketUrl: string | undefined | null): void {
  if (!ticketUrl) return;
  try {
    const url = new URL(ticketUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new TypeError('Invalid ticket URL: must use http or https');
    }
  } catch {
    throw new TypeError('Invalid ticket URL');
  }
}
