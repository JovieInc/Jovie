/**
 * Tour Dates Types
 *
 * Type definitions for tour dates, Bandsintown integration, and view models
 */

export type TicketStatus = 'available' | 'cancelled' | 'sold_out';

export interface TourDateViewModel {
  id: string;
  profileId: string;
  externalId: string | null;
  provider: 'bandsintown' | 'manual' | 'songkick';
  title: string | null;
  startDate: string;
  startTime: string | null;
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

export interface ProfileInfo {
  id: string;
  bandsintownArtistName: string | null;
  bandsintownApiKey: string | null;
  handle: string;
}
