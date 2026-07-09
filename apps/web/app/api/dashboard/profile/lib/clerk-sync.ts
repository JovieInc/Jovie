import { NextResponse } from 'next/server';
import {
  syncCanonicalUsernameFromApp,
  UsernameValidationError,
} from '@/lib/username/sync';
import { NO_STORE_HEADERS } from './constants';

export async function guardUsernameUpdate(
  userId: string,
  usernameUpdate: string | undefined
): Promise<NextResponse | null> {
  if (!usernameUpdate) return null;

  try {
    await syncCanonicalUsernameFromApp(userId, usernameUpdate);
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

export async function syncClerkProfile(
  _params: SyncClerkProfileParams
): Promise<SyncClerkProfileResult> {
  return { clerkSyncFailed: false };
}
