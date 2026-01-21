/**
 * Profile Route Library
 *
 * Re-exports for the profile API route modules.
 */

export type { SyncClerkProfileParams } from './clerk-sync';

export { guardUsernameUpdate, syncClerkProfile } from './clerk-sync';
export { ALLOWED_PROFILE_FIELDS, NO_STORE_HEADERS } from './constants';
export type { ProfileUpdateContext } from './context';
export { buildClerkUpdates, buildProfileUpdateContext } from './context';
export type { UpdateProfileRecordsParams } from './db-operations';
export { getProfileByClerkId, updateProfileRecords } from './db-operations';
export type { FinalizeProfileResponseParams } from './response';
export { addAvatarCacheBust, finalizeProfileResponse } from './response';
export type { TestProfileUpdateParams } from './test-helpers';
export { handleTestProfileUpdate } from './test-helpers';
export type {
  ParsedUpdatesResult,
  ProfileUpdateInput,
  UpdatesValidationResult,
} from './validation';
export {
  ProfileUpdateSchema,
  parseProfileUpdates,
  validateUpdatesPayload,
} from './validation';
