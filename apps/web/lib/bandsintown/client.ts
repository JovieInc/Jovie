/**
 * Bandsintown API Client
 *
 * Provides a simple client for fetching tour dates from Bandsintown.
 * - Read-only API (no authentication required beyond app_id)
 * - Retry logic with exponential backoff
 * - Response sanitization
 */

import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { captureError, captureWarning } from '@/lib/error-tracking';
import {
  BANDSINTOWN_API_BASE,
  BANDSINTOWN_DEFAULT_TIMEOUT_MS,
  getBandsintownConfig,
  isBandsintownConfigured,
} from './env';
import type {
  BandsintownArtist,
  BandsintownEvent,
  SanitizedEvent,
} from './types';

// ============================================================================
// Constants
// ============================================================================

const MAX_RETRIES = 2;
const BASE_DELAY_MS = 1000;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parse latitude/longitude strings to numbers
 */
function parseCoordinate(value: string | undefined): number | null {
  if (!value) return null;
  const num = Number.parseFloat(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * Sanitize a raw Bandsintown event into our internal format
 */
function sanitizeEvent(event: BandsintownEvent): SanitizedEvent {
  // Find ticket URL from offers
  const ticketOffer = event.offers?.find(
    offer => offer.type === 'Tickets' && offer.url
  );
  const ticketUrl = ticketOffer?.url ?? event.url ?? null;

  // Determine ticket status from offers
  const isSoldOut = event.offers?.some(
    offer => offer.status?.toLowerCase() === 'sold out'
  );

  // Parse datetime - Bandsintown uses ISO format
  const startDate = new Date(event.datetime);

  // Extract time from datetime for display
  const startTime = startDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return {
    externalId: event.id,
    title: event.title || null,
    startDate,
    startTime,
    venueName: event.venue?.name ?? 'TBA',
    city: event.venue?.city ?? 'TBA',
    region: event.venue?.region || null,
    country: event.venue?.country ?? 'Unknown',
    latitude: parseCoordinate(event.venue?.latitude),
    longitude: parseCoordinate(event.venue?.longitude),
    ticketUrl,
    ticketStatus: isSoldOut ? 'sold_out' : 'available',
    rawData: event as unknown as Record<string, unknown>,
  };
}

// ============================================================================
// Client Class
// ============================================================================

class BandsintownClient {
  /**
   * Check if Bandsintown is configured and available
   */
  isAvailable(): boolean {
    return isBandsintownConfigured();
  }

  /**
   * Make a request to the Bandsintown API with retry logic
   */
  private async request<T>(endpoint: string): Promise<T> {
    const config = getBandsintownConfig();

    if (!config.isConfigured) {
      throw new Error('Bandsintown not configured');
    }

    const url = `${BANDSINTOWN_API_BASE}${endpoint}`;
    const separator = endpoint.includes('?') ? '&' : '?';
    const fullUrl = `${url}${separator}app_id=${encodeURIComponent(config.appId)}`;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(fullUrl, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(BANDSINTOWN_DEFAULT_TIMEOUT_MS),
        });

        if (!response.ok) {
          // Don't retry 404s - artist not found
          if (response.status === 404) {
            throw new Error(`Artist not found on Bandsintown`);
          }

          // Retry server errors
          if (response.status >= 500 && attempt < MAX_RETRIES) {
            const delay = BASE_DELAY_MS * Math.pow(2, attempt);
            Sentry.addBreadcrumb({
              category: 'bandsintown',
              message: `Retrying after ${response.status}`,
              level: 'warning',
              data: { attempt, delay },
            });
            await sleep(delay);
            continue;
          }

          throw new Error(`Bandsintown API error: ${response.status}`);
        }

        return (await response.json()) as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry abort/timeout errors or known failures
        if (
          error instanceof DOMException ||
          lastError.message.includes('not found')
        ) {
          throw lastError;
        }

        // Retry on network errors
        if (attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          await sleep(delay);
          continue;
        }
      }
    }

    throw lastError ?? new Error('Unknown Bandsintown error');
  }

  /**
   * Verify an artist exists on Bandsintown
   */
  async verifyArtist(artistName: string): Promise<BandsintownArtist | null> {
    if (!this.isAvailable()) {
      captureWarning('[Bandsintown] Not configured');
      return null;
    }

    try {
      const artist = await this.request<BandsintownArtist>(
        `/artists/${encodeURIComponent(artistName)}`
      );

      // Bandsintown returns an error object if artist not found
      if (!artist || !artist.id) {
        return null;
      }

      return artist;
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return null;
      }
      captureError('[Bandsintown] Verify artist failed', error);
      throw error;
    }
  }

  /**
   * Fetch upcoming events for an artist
   */
  async getArtistEvents(artistName: string): Promise<SanitizedEvent[]> {
    if (!this.isAvailable()) {
      captureWarning('[Bandsintown] Not configured - returning empty results');
      return [];
    }

    return Sentry.startSpan(
      { op: 'http.client', name: 'Bandsintown: Get Artist Events' },
      async span => {
        span.setAttribute('bandsintown.artist', artistName);

        try {
          const events = await this.request<BandsintownEvent[]>(
            `/artists/${encodeURIComponent(artistName)}/events`
          );

          // Bandsintown returns empty array if no events
          if (!Array.isArray(events)) {
            return [];
          }

          span.setAttribute('bandsintown.event_count', events.length);

          // Sanitize and return events
          return events.map(sanitizeEvent);
        } catch (error) {
          if (error instanceof Error && error.message.includes('not found')) {
            return [];
          }
          captureError('[Bandsintown] Get events failed', error, {
            artist: artistName,
          });
          throw error;
        }
      }
    );
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Global Bandsintown client instance
 */
export const bandsintownClient = new BandsintownClient();

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Check if Bandsintown integration is available
 */
export function isBandsintownAvailable(): boolean {
  return bandsintownClient.isAvailable();
}

/**
 * Verify an artist exists on Bandsintown
 */
export async function verifyBandsintownArtist(
  artistName: string
): Promise<BandsintownArtist | null> {
  return bandsintownClient.verifyArtist(artistName);
}

/**
 * Fetch tour dates for an artist from Bandsintown
 */
export async function fetchBandsintownEvents(
  artistName: string
): Promise<SanitizedEvent[]> {
  return bandsintownClient.getArtistEvents(artistName);
}
