/**
 * DSP Enrichment System
 *
 * Cross-platform artist matching, profile enrichment,
 * and new release detection.
 *
 * NOTE: This barrel file exports ONLY types and client-safe code.
 * For server-only functionality (providers, matching, circuit breakers),
 * import from './index.server' instead.
 *
 * @example
 * // Client code (types only)
 * import type { DspProviderId, DspMatchStatus } from '@/lib/dsp-enrichment';
 *
 * // Server code (full functionality)
 * import { lookupAppleMusicByIsrc } from '@/lib/dsp-enrichment/index.server';
 */

// Types only - safe for client bundles
export type {
  CircuitBreakerConfig,
  CircuitBreakerStats,
  CircuitState,
} from './circuit-breakers';

export type {
  LocalArtistData,
  LocalTrackData,
  MatchingResult,
} from './matching';

// All types from types.ts are safe for client
export * from './types';
