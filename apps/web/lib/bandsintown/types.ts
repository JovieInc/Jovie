/**
 * Bandsintown API Type Definitions
 */

/**
 * Raw venue data from Bandsintown API
 */
export interface BandsintownVenue {
  name: string;
  latitude: string;
  longitude: string;
  city: string;
  region: string;
  country: string;
}

/**
 * Raw event data from Bandsintown API
 */
export interface BandsintownEvent {
  id: string;
  artist_id: string;
  url: string;
  on_sale_datetime: string;
  datetime: string;
  title: string;
  description: string;
  venue: BandsintownVenue;
  lineup: string[];
  offers: Array<{
    type: string;
    url: string;
    status: string;
  }>;
}

/**
 * Raw artist data from Bandsintown API
 */
export interface BandsintownArtist {
  id: string;
  name: string;
  url: string;
  image_url: string;
  thumb_url: string;
  facebook_page_url: string;
  mbid: string;
  tracker_count: number;
  upcoming_event_count: number;
}

/**
 * Sanitized event data for application use
 */
export interface SanitizedEvent {
  externalId: string;
  title: string | null;
  startDate: Date;
  startTime: string | null;
  venueName: string;
  city: string;
  region: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  ticketUrl: string | null;
  ticketStatus: 'available' | 'sold_out' | 'cancelled';
  rawData: Record<string, unknown>;
}
