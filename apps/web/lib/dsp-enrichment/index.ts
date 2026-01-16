/**
 * DSP Enrichment System
 *
 * Cross-platform artist matching, profile enrichment,
 * and new release detection.
 */

export type {
  CircuitBreakerConfig,
  CircuitBreakerStats,
  CircuitState,
} from './circuit-breakers';

// Circuit breakers (server-only)
export {
  appleMusicCircuitBreaker,
  deezerCircuitBreaker,
  getAllCircuitBreakerStats,
  getCircuitBreakerForProvider,
  musicBrainzCircuitBreaker,
  resetAllCircuitBreakers,
} from './circuit-breakers';
// Types and constants
export * from './types';
