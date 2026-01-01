/**
 * Profile Service
 *
 * Centralized profile data access layer.
 * This is the single source of truth for profile queries and mutations.
 *
 * @example
 * ```typescript
 * import { getProfileByUsername, updateProfileById } from '@/lib/services/profile';
 *
 * // Get a profile
 * const profile = await getProfileByUsername('johndoe');
 *
 * // Get profile with links and contacts
 * const fullProfile = await getProfileWithLinks('johndoe');
 *
 * // Update a profile
 * await updateProfileById(profileId, { displayName: 'John Doe' });
 * ```
 */

// Mutations
export {
  incrementProfileViews,
  publishProfile,
  updateProfileByClerkId,
  updateProfileById,
} from './mutations';

// Queries
export {
  getProfileById,
  getProfileByUsername,
  getProfileContacts,
  getProfileSocialLinks,
  getProfileSummary,
  getProfileWithLinks,
  getProfileWithUser,
  isClaimTokenValid,
} from './queries';
// Types
export type {
  ProfileData,
  ProfileQueryOptions,
  ProfileSocialLink,
  ProfileSummary,
  ProfileUpdateData,
  ProfileWithLinks,
  ProfileWithUser,
} from './types';
