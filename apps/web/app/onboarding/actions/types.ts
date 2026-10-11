/**
 * Type definitions for onboarding operations
 */

import type { creatorProfiles } from '@/lib/db/schema/profiles';

export type CompletionStatus = 'created' | 'updated' | 'complete';

export interface CompletionResult {
  username: string;
  status: CompletionStatus;
  profileId: string | null;
}

/** Only the allowlisted expected failure crosses the Server Action boundary. */
export type OnboardingCompletionResult =
  | CompletionResult
  | { error: 'CLAIM_EXPIRED' };

export interface AvatarUploadResult {
  blobUrl: string;
  photoId: string;
  retriesUsed: number;
}

export interface AvatarFetchResult {
  buffer: ArrayBuffer;
  contentType: string;
}

export type CreatorProfile = typeof creatorProfiles.$inferSelect;
