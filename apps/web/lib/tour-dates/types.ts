export type TicketStatus = 'available' | 'sold_out' | 'cancelled';

export type EventTypeValue =
  | 'tour'
  | 'livestream'
  | 'listening_party'
  | 'ama'
  | 'signing';

export type ConfirmationStatusValue = 'pending' | 'confirmed' | 'rejected';

export type TourDateProviderValue =
  | 'bandsintown'
  | 'songkick'
  | 'manual'
  | 'admin_import';

export interface TourDateViewModel {
  id: string;
  profileId: string;
  externalId: string | null;
  provider: TourDateProviderValue;
  eventType: EventTypeValue;
  confirmationStatus: ConfirmationStatusValue;
  reviewedAt: string | null;
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
