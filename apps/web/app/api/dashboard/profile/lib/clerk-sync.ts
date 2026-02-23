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

export interface SyncClerkProfileResult {
  clerkSyncFailed: boolean;
  rollback?: () => Promise<void>;
}

async function fetchAvatarBlob(avatarUrl: string): Promise<Blob> {
  const avatarResponse = await fetch(avatarUrl, {
    signal: AbortSignal.timeout(10000),
  });
  if (!avatarResponse.ok) {
    throw new Error(`Avatar fetch failed: ${avatarResponse.status}`);
  }

  const contentType = avatarResponse.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    throw new TypeError(`Invalid content type: ${contentType}`);
  }

  const arrayBuffer = await avatarResponse.arrayBuffer();
  if (arrayBuffer.byteLength > 5 * 1024 * 1024) {
    throw new RangeError('Avatar file size exceeds 5MB limit');
  }

  return new Blob([arrayBuffer], { type: contentType });
}

async function updateClerkAvatar(
  clerkUserId: string,
  avatarUrl: string,
  clerk: Awaited<ReturnType<typeof clerkClient>>
) {
  const blob = await fetchAvatarBlob(avatarUrl);
  await clerk.users.updateUserProfileImage(clerkUserId, {
    file: blob,
  });
}

export async function syncClerkProfile({
  clerkUserId,
  clerkUpdates,
  avatarUrl,
}: SyncClerkProfileParams): Promise<SyncClerkProfileResult> {
  const hasClerkUpdates = Object.keys(clerkUpdates).length > 0;
  const hasAvatarUpdate = Boolean(avatarUrl);
  if (!hasClerkUpdates && !hasAvatarUpdate) {
    return { clerkSyncFailed: false };
  }

  let clerkSyncFailed = false;
  let rollback: (() => Promise<void>) | undefined;
  let clerk: Awaited<ReturnType<typeof clerkClient>> | null = null;
  let rollbackSnapshot: {
    firstName: string | null;
    lastName: string | null;
    imageUrl: string | null;
  } | null = null;

  try {
    clerk = await clerkClient();
  } catch (error) {
    logger.error('Failed to initialize Clerk client:', {
      error: error instanceof Error ? error.message : error,
      userId: clerkUserId,
    });
    return { clerkSyncFailed: true };
  }

  if (!clerk) {
    return { clerkSyncFailed: true };
  }

  try {
    const user = await clerk.users.getUser(clerkUserId);
    rollbackSnapshot = {
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      imageUrl: user.imageUrl ?? null,
    };
  } catch (error) {
    logger.error('Failed to load Clerk user for rollback:', {
      error: error instanceof Error ? error.message : error,
      userId: clerkUserId,
    });
  }

  let updatedName = false;
  let updatedAvatar = false;
  try {
    if (hasClerkUpdates) {
      await clerk.users.updateUser(clerkUserId, clerkUpdates);
      updatedName = true;
    }

    if (avatarUrl) {
      await updateClerkAvatar(clerkUserId, avatarUrl, clerk);
      updatedAvatar = true;
    }
  } catch (error) {
    clerkSyncFailed = true;
    logger.error('Failed to sync profile updates with Clerk:', {
      error: error instanceof Error ? error.message : error,
      userId: clerkUserId,
      hasAvatarUrl: !!avatarUrl,
    });
  }

  if (rollbackSnapshot && (updatedName || updatedAvatar)) {
    rollback = async () => {
      if (updatedName) {
        await clerk.users.updateUser(clerkUserId, {
          firstName: rollbackSnapshot?.firstName ?? undefined,
          lastName: rollbackSnapshot?.lastName ?? undefined,
        });
      }

      if (updatedAvatar && rollbackSnapshot.imageUrl) {
        await updateClerkAvatar(clerkUserId, rollbackSnapshot.imageUrl, clerk);
      }
    };
  }

  return { clerkSyncFailed, rollback };
}
