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

import {
  CircuitBreaker,
  type CircuitBreakerConfig,
} from '@/lib/spotify/circuit-breaker';

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
  failureThreshold: 5, // Open after 5 failures
  resetTimeout: 30_000, // Try again after 30 seconds
  successThreshold: 2, // Need 2 successes to close
  failureWindow: 60_000, // Count failures within 1 minute
};

/**
 * Deezer circuit breaker configuration.
 * Deezer has moderate rate limits (50 req/sec) and generally stable service.
 */
const DEEZER_CONFIG: Partial<CircuitBreakerConfig> = {
  failureThreshold: 5, // Open after 5 failures
  resetTimeout: 30_000, // Try again after 30 seconds
  successThreshold: 2, // Need 2 successes to close
  failureWindow: 60_000, // Count failures within 1 minute
};

/**
 * MusicBrainz circuit breaker configuration.
 * MusicBrainz is a free service with strict rate limits (1 req/sec).
 * We use more conservative thresholds to avoid hammering their servers.
 */
const MUSICBRAINZ_CONFIG: Partial<CircuitBreakerConfig> = {
  failureThreshold: 3, // Open after 3 failures (more conservative)
  resetTimeout: 60_000, // Try again after 60 seconds (longer cooldown)
  successThreshold: 2, // Need 2 successes to close
  failureWindow: 120_000, // Count failures within 2 minutes
};

// ============================================================================
// Circuit Breaker Instances
// ============================================================================

/**
 * Global circuit breaker for Apple Music API calls.
 */
export const appleMusicCircuitBreaker = new CircuitBreaker(APPLE_MUSIC_CONFIG);

/**
 * Global circuit breaker for Deezer API calls.
 */
export const deezerCircuitBreaker = new CircuitBreaker(DEEZER_CONFIG);

/**
 * Global circuit breaker for MusicBrainz API calls.
 * More conservative due to the free nature of the service.
 */
export const musicBrainzCircuitBreaker = new CircuitBreaker(MUSICBRAINZ_CONFIG);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the circuit breaker for a specific DSP provider.
 */
export function getCircuitBreakerForProvider(
  providerId: string
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
 */
export function getAllCircuitBreakerStats() {
  return {
    apple_music: appleMusicCircuitBreaker.getStats(),
    deezer: deezerCircuitBreaker.getStats(),
    musicbrainz: musicBrainzCircuitBreaker.getStats(),
  };
}

/**
 * Reset all circuit breakers (for testing or manual intervention).
 */
export function resetAllCircuitBreakers() {
  appleMusicCircuitBreaker.reset();
  deezerCircuitBreaker.reset();
  musicBrainzCircuitBreaker.reset();
}
