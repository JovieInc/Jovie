/**
 * Social Links Service
 *
 * Modular service for social link management.
 * Extracted from the monolithic API route for better testability and reuse.
 */

export { scheduleIngestionJobs } from './ingestion';
// Mutations
export {
  activateLink,
  createLink,
  deleteLink,
  rejectLink,
  reorderLinks,
  updateLink,
} from './mutations';
// Queries
export {
  getActiveLinksForProfile,
  getLinkById,
  getLinksByProfileId,
  getLinksByProfileIdForUser,
} from './queries';
export { checkRateLimit } from './rate-limit';
export {
  type UpdateLinkStateInput,
  type UpdateSocialLinksInput,
  updateLinkStateSchema,
  updateSocialLinksSchema,
} from './schemas';
// Types
export type {
  CreateLinkData,
  DashboardSocialLink,
  DspPlatform,
  LinkSourceType,
  LinkState,
  UpdateLinkData,
} from './types';
export { DSP_PLATFORMS, isDspPlatform } from './types';
