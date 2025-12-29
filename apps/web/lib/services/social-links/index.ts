/**
 * Social Links Service
 *
 * Modular service for social link management.
 * Extracted from the monolithic API route for better testability and reuse.
 */

export { checkIdempotencyKey, storeIdempotencyKey } from './idempotency';
export { scheduleIngestionJobs } from './ingestion';
export { checkRateLimit } from './rate-limit';
export {
  type UpdateLinkStateInput,
  type UpdateSocialLinksInput,
  updateLinkStateSchema,
  updateSocialLinksSchema,
} from './schemas';
