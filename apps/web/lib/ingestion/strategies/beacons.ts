/**
 * Beacons.ai Profile Ingestion Strategy
 *
 * This file re-exports from the beacons/ directory for backwards compatibility.
 * The implementation has been split into focused modules for reduced complexity.
 *
 * @see ./beacons/index.ts for the module structure
 */

export {
  BEACONS_CONFIG,
  detectBeaconsPaidTier,
  ExtractionError,
  extractBeacons,
  extractBeaconsHandle,
  fetchBeaconsDocument,
  isBeaconsUrl,
  isValidHandle,
  normalizeHandle,
  SKIP_HOSTS,
  validateBeaconsUrl,
} from './beacons/index';
