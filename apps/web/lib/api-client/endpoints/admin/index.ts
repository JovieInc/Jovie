/**
 * Admin API Endpoints
 *
 * Centralized exports for all admin API endpoint methods.
 * Import from this module to access typed methods for admin operations.
 *
 * @example
 * ```ts
 * // Import specific namespaces
 * import { adminCreators } from '@/lib/api-client/endpoints/admin';
 *
 * // Or import everything
 * import * as admin from '@/lib/api-client/endpoints/admin';
 *
 * // Use individual methods
 * const { profile } = await adminCreators.ingest({ url: 'https://linktr.ee/artist' });
 * const { links } = await adminCreators.getSocialLinks('profile-id');
 * await adminCreators.refresh('profile-id');
 * ```
 */

// =============================================================================
// Type Exports
// =============================================================================

// Export all types from the types module
export * from './types';

// =============================================================================
// Module Exports
// =============================================================================

// Creators exports
export {
  // Types
  type AdminCreatorRequestOptions,
  // Namespace
  adminCreators,
  // Individual methods
  getCreatorSocialLinks,
  getCreatorSocialLinksSafe,
  type IngestCreatorParams,
  type IngestCreatorResult,
  ingestCreator,
  ingestCreatorSafe,
  ingestFromLaylo,
  ingestFromLinktree,
  type RerunIngestionParams,
  refreshProfile,
  refreshProfileSafe,
  rerunIngestion,
  rerunIngestionSafe,
  type UpdateCreatorAvatarParams,
  updateCreatorAvatar,
  updateCreatorAvatarSafe,
} from './creators';

// =============================================================================
// Combined Namespace
// =============================================================================

import { adminCreators } from './creators';

/**
 * Combined admin API namespace
 *
 * Provides access to all admin endpoint methods through a single object.
 * Useful for dependency injection or when you want all methods in one place.
 *
 * @example
 * ```ts
 * import { admin } from '@/lib/api-client/endpoints/admin';
 *
 * // Access all endpoint groups
 * const { profile } = await admin.creators.ingest({ url: 'https://linktr.ee/artist' });
 * const { links } = await admin.creators.getSocialLinks('profile-id');
 * const { jobId } = await admin.creators.refresh('profile-id');
 *
 * // Safe versions (no throw)
 * const result = await admin.creators.ingestSafe({ url: 'https://linktr.ee/artist' });
 * if (!result.ok) {
 *   console.error(result.error.message);
 * }
 * ```
 */
export const admin = {
  /**
   * Creator management endpoint methods
   * @see {@link adminCreators}
   */
  creators: adminCreators,
} as const;

// Default export
export default admin;
