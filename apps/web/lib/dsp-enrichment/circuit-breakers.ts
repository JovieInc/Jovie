/**
 * Circuit Breakers for DSP Enrichment Providers
 *
 * Implements the circuit breaker pattern for external DSP API calls
 * to prevent cascading failures when providers are experiencing issues.
 *
 * Each provider has its own circuit breaker instance with configurations
 * tuned to their specific rate limits and reliability patterns.
 */

import 'server-only';

import { musicfetchCircuitBreaker } from '@/lib/discography/musicfetch-circuit-breaker';
import {
  CircuitBreaker,
  type CircuitBreakerConfig,
  spotifyCircuitBreaker,
} from '@/lib/spotify/circuit-breaker';

import type { DspProviderId } from './types';

export type {
  CircuitBreakerConfig,
  CircuitBreakerStats,
  CircuitState,
} from '@/lib/spotify/circuit-breaker';
// Re-export types for convenience
export {
  CircuitBreaker,
  CircuitOpenError,
} from '@/lib/spotify/circuit-breaker';

// ============================================================================
// Provider-Specific Configurations
// ============================================================================

/**
 * Apple Music circuit breaker configuration.
 * Apple Music has generous rate limits (100 req/sec) but can have
 * occasional service disruptions.
 */
const APPLE_MUSIC_CONFIG: Partial<CircuitBreakerConfig> = {
  failureThreshold: 10, // Open after 10 failures
  resetTimeout: 60_000, // Try again after 60 seconds
  successThreshold: 2, // Need 2 successes to close
  failureWindow: 120_000, // Count failures within 2 minutes
  minimumRequestCount: 20, // Need 20 requests before circuit can open
};

/**
 * Deezer circuit breaker configuration.
 * Deezer has moderate rate limits (50 req/sec) and generally stable service.
 */
const DEEZER_CONFIG: Partial<CircuitBreakerConfig> = {
  failureThreshold: 10, // Open after 10 failures
  resetTimeout: 60_000, // Try again after 60 seconds
  successThreshold: 2, // Need 2 successes to close
  failureWindow: 120_000, // Count failures within 2 minutes
  minimumRequestCount: 20, // Need 20 requests before circuit can open
};

/**
 * MusicBrainz circuit breaker configuration.
 * MusicBrainz is a free service with strict rate limits (1 req/sec).
 * We use more conservative thresholds to avoid hammering their servers.
 */
const MUSICBRAINZ_CONFIG: Partial<CircuitBreakerConfig> = {
  failureThreshold: 5, // Open after 5 failures (conservative for free service)
  resetTimeout: 90_000, // Try again after 90 seconds (longer cooldown)
  successThreshold: 2, // Need 2 successes to close
  failureWindow: 120_000, // Count failures within 2 minutes
  minimumRequestCount: 10, // Need 10 requests before circuit can open
};

// ============================================================================
// Circuit Breaker Instances
// ============================================================================

/**
 * Global circuit breaker for Apple Music API calls.
 */
export const appleMusicCircuitBreaker = new CircuitBreaker({
  name: 'apple_music',
  ...APPLE_MUSIC_CONFIG,
});

/**
 * Global circuit breaker for Deezer API calls.
 */
export const deezerCircuitBreaker = new CircuitBreaker({
  name: 'deezer',
  ...DEEZER_CONFIG,
});

/**
 * Global circuit breaker for MusicBrainz API calls.
 * More conservative due to the free nature of the service.
 */
export const musicBrainzCircuitBreaker = new CircuitBreaker({
  name: 'musicbrainz',
  ...MUSICBRAINZ_CONFIG,
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the circuit breaker for a specific DSP provider.
 */
export function getCircuitBreakerForProvider(
  providerId: DspProviderId
): CircuitBreaker | null {
  switch (providerId) {
    case 'apple_music':
      return appleMusicCircuitBreaker;
    case 'deezer':
      return deezerCircuitBreaker;
    case 'musicbrainz':
      return musicBrainzCircuitBreaker;
    default:
      return null;
  }
}

/**
 * Get all circuit breaker stats for monitoring.
 * Includes all DSP providers and Spotify for unified observability.
 */
export function getAllCircuitBreakerStats() {
  return {
    spotify: spotifyCircuitBreaker.getStats(),
    apple_music: appleMusicCircuitBreaker.getStats(),
    deezer: deezerCircuitBreaker.getStats(),
    musicbrainz: musicBrainzCircuitBreaker.getStats(),
    musicfetch: musicfetchCircuitBreaker.getStats(),
  };
}

/**
 * Reset all circuit breakers (for testing or manual intervention).
 * Includes all DSP providers and Spotify for unified management.
 */
export function resetAllCircuitBreakers() {
  spotifyCircuitBreaker.reset();
  appleMusicCircuitBreaker.reset();
  deezerCircuitBreaker.reset();
  musicBrainzCircuitBreaker.reset();
  musicfetchCircuitBreaker.reset();
}
