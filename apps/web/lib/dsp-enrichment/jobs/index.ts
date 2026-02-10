/**
 * DSP Enrichment Jobs
 *
 * Job processors for DSP-related background tasks:
 * - Artist discovery across platforms
 * - Profile enrichment (photos, names, metadata)
 * - Track enrichment with DSP links
 * - Discography sync
 */

export {
  type DspArtistDiscoveryPayloadSchema,
  dspArtistDiscoveryPayloadSchema,
  processDspArtistDiscoveryJob,
  processDspArtistDiscoveryJobStandalone,
} from './dsp-artist-discovery';

export {
  enrichProfileFromDsp,
  type ProfileEnrichmentPayload,
  type ProfileEnrichmentResult,
  processProfileEnrichmentJob,
  processProfileEnrichmentJobStandalone,
  profileEnrichmentPayloadSchema,
} from './profile-enrichment';

export {
  processReleaseEnrichmentJob,
  processReleaseEnrichmentJobStandalone,
  releaseEnrichmentPayloadSchema,
} from './release-enrichment';
