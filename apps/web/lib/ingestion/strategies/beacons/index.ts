/**
 * Beacons.ai Profile Ingestion Strategy
 *
 * Extracts profile data and links from Beacons.ai profiles.
 * Hardened for server-side use with proper error handling, timeouts, and retries.
 */

// Re-export base error type
export { ExtractionError } from '../base';
// Re-export configuration
export { BEACONS_CONFIG, SKIP_HOSTS } from './config';
// Re-export extraction function
export { extractBeacons } from './extraction';
// Re-export fetch function
export { fetchBeaconsDocument } from './fetch';

// Re-export paid tier detection
export { detectBeaconsPaidTier } from './paid-tier';
// Re-export validation functions
export {
  extractBeaconsHandle,
  isBeaconsUrl,
  isValidHandle,
  normalizeHandle,
  validateBeaconsUrl,
} from './validation';
