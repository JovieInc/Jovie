/**
 * DSP Enrichment Jobs
 *
 * Job processors for DSP-related background tasks:
 * - Artist discovery across platforms
 * - Track enrichment with DSP links
 * - Discography sync
 */

export {
  type DspArtistDiscoveryPayloadSchema,
  dspArtistDiscoveryPayloadSchema,
  processDspArtistDiscoveryJob,
  processDspArtistDiscoveryJobStandalone,
} from './dsp-artist-discovery';
