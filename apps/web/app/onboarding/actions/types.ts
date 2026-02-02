/**
 * Type definitions for onboarding operations
 */

import type { creatorProfiles } from '@/lib/db/schema';

export type CompletionStatus = 'created' | 'updated' | 'complete';

export interface CompletionResult {
  username: string;
  status: CompletionStatus;
  profileId: string | null;
}

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
