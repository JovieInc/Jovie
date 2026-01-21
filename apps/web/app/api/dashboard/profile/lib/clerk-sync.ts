/**
 * Clerk Profile Sync
 *
 * Handles synchronizing profile updates with Clerk.
 */

import { clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  syncCanonicalUsernameFromApp,
  UsernameValidationError,
} from '@/lib/username/sync';
import { logger } from '@/lib/utils/logger';
import { NO_STORE_HEADERS } from './constants';

export async function guardUsernameUpdate(
  clerkUserId: string,
  usernameUpdate: string | undefined
): Promise<NextResponse | null> {
  if (!usernameUpdate) return null;

  try {
    await syncCanonicalUsernameFromApp(clerkUserId, usernameUpdate);
    return null;
  } catch (error) {
    if (error instanceof UsernameValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    throw error;
  }
}

export interface SyncClerkProfileParams {
  clerkUserId: string;
  clerkUpdates: Record<string, unknown>;
  avatarUrl: string | undefined;
}

export async function syncClerkProfile({
  clerkUserId,
  clerkUpdates,
  avatarUrl,
}: SyncClerkProfileParams): Promise<boolean> {
  let clerkSyncFailed = false;
  try {
    if (Object.keys(clerkUpdates).length > 0) {
      const clerk = await clerkClient();
      await clerk.users.updateUser(clerkUserId, clerkUpdates);
    }

    if (avatarUrl) {
      const avatarResponse = await fetch(avatarUrl, {
        signal: AbortSignal.timeout(10000),
      });
      if (!avatarResponse.ok) {
        throw new Error(`Avatar fetch failed: ${avatarResponse.status}`);
      }

      const contentType = avatarResponse.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) {
        throw new Error(`Invalid content type: ${contentType}`);
      }

      const arrayBuffer = await avatarResponse.arrayBuffer();
      if (arrayBuffer.byteLength > 5 * 1024 * 1024) {
        throw new Error('Avatar file size exceeds 5MB limit');
      }

      const blob = new Blob([arrayBuffer], { type: contentType });

      const clerk = await clerkClient();
      await clerk.users.updateUserProfileImage(clerkUserId, {
        file: blob,
      });
    }
  } catch (error) {
    clerkSyncFailed = true;
    logger.error('Failed to sync profile updates with Clerk:', {
      error: error instanceof Error ? error.message : error,
      userId: clerkUserId,
      hasAvatarUrl: !!avatarUrl,
    });
  }

  return clerkSyncFailed;
}
