export type TicketStatus = 'available' | 'sold_out' | 'cancelled';

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
