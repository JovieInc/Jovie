/**
 * Onboarding Actions - Barrel Export
 * Provides backward compatibility by re-exporting from modular actions directory.
 *
 * Internal structure:
 * - types.ts: Type definitions
 * - helpers.ts: Utility functions (getRequestBaseUrl, profileIsPublishable)
 * - avatar.ts: Avatar fetch/upload with retry logic
 * - validation.ts: Email and handle validation
 * - profile-setup.ts: User/profile CRUD operations
 * - sync.ts: Background sync operations
 * - errors.ts: Error logging and context
 * - index.ts: Main completeOnboarding flow
 */

export { completeOnboarding } from './actions/index';
export type {
  AvatarFetchResult,
  AvatarUploadResult,
  CompletionResult,
  CompletionStatus,
  CreatorProfile,
} from './actions/types';
