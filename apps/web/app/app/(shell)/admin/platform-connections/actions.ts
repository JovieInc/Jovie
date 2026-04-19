'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { APP_ROUTES } from '@/constants/routes';
import {
  getPlaylistSpotifyStatus,
  invalidatePlatformConnectionsCache,
  PLAYLIST_INTERVAL_UNITS,
  setPlaylistEngineSettings,
  setPlaylistSpotifyClerkUserId,
} from '@/lib/admin/platform-connections';
import { isAdmin as checkAdminRole } from '@/lib/admin/roles';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { adminAuditLog } from '@/lib/db/schema/admin';
import { users } from '@/lib/db/schema/auth';
import { captureError } from '@/lib/error-tracking';
import { generatePlaylist } from '@/lib/playlists/pipeline';

type ActionState =
  | {
      readonly success: true;
      readonly message: string;
      readonly playlistId?: string;
    }
  | { readonly success: false; readonly message: string };

const engineSettingsSchema = z.object({
  enabled: z.boolean(),
  intervalValue: z
    .number()
    .int()
    .min(1, 'Playlist generation interval must be at least 1.')
    .max(52, 'Playlist generation interval must be 52 or less.'),
  intervalUnit: z.enum(PLAYLIST_INTERVAL_UNITS),
});

function actionErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof z.ZodError) {
    return error.issues.at(0)?.message ?? fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

async function requireAdminClerkUserId(): Promise<string> {
  const { userId } = await getCachedAuth();
  if (!userId || !(await checkAdminRole(userId))) {
    throw new Error('Unauthorized');
  }
  return userId;
}

async function getAppUserId(clerkUserId: string): Promise<string | null> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);
  return user?.id ?? null;
}

async function writeAuditLog(
  clerkUserId: string,
  action: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const appUserId = await getAppUserId(clerkUserId);
  if (!appUserId) {
    captureError('[Admin Audit] User mapping not found', null, {
      clerkUserId,
      action,
      metadata,
    });
    return;
  }

  await db.insert(adminAuditLog).values({
    adminUserId: appUserId,
    action,
    metadata,
  });
}

export async function setCurrentAdminAsPlaylistSpotifyPublisher(): Promise<ActionState> {
  try {
    const clerkUserId = await requireAdminClerkUserId();
    await setPlaylistSpotifyClerkUserId({
      clerkUserId,
      updatedByClerkUserId: clerkUserId,
    });
    await writeAuditLog(clerkUserId, 'playlist_spotify_publisher_updated', {
      source: 'current_admin',
    });
    revalidatePath(APP_ROUTES.ADMIN_PLATFORM_CONNECTIONS);
    return { success: true, message: 'Spotify publisher updated.' };
  } catch (error) {
    captureError('[Admin Platform Connections] Publisher update failed', error);
    return {
      success: false,
      message: actionErrorMessage(error, 'Spotify publisher update failed.'),
    };
  }
}

export async function updatePlaylistEngineSettings(input: {
  readonly enabled: boolean;
  readonly intervalValue: number;
  readonly intervalUnit: string;
}): Promise<ActionState> {
  try {
    const clerkUserId = await requireAdminClerkUserId();
    const parsed = engineSettingsSchema.parse(input);
    await setPlaylistEngineSettings(parsed);
    await writeAuditLog(
      clerkUserId,
      'playlist_engine_settings_updated',
      parsed
    );
    revalidatePath(APP_ROUTES.ADMIN_PLATFORM_CONNECTIONS);
    return { success: true, message: 'Playlist engine settings saved.' };
  } catch (error) {
    captureError(
      '[Admin Platform Connections] Engine settings update failed',
      error
    );
    return {
      success: false,
      message: actionErrorMessage(
        error,
        'Playlist engine settings update failed.'
      ),
    };
  }
}

export async function generateTestPlaylist(): Promise<ActionState> {
  try {
    const clerkUserId = await requireAdminClerkUserId();
    const spotifyStatus = await getPlaylistSpotifyStatus();
    if (!spotifyStatus.healthy) {
      return {
        success: false,
        message:
          spotifyStatus.error ??
          'Spotify publisher is not healthy. Reconnect Spotify before generating.',
      };
    }

    const result = await generatePlaylist({
      skipComplianceCheck: true,
      recordCadenceOnSuccess: false,
    });
    if (!result.success || !result.playlistId) {
      return {
        success: false,
        message:
          result.error ?? result.skipReason ?? 'Playlist generation failed.',
      };
    }

    await writeAuditLog(clerkUserId, 'playlist_test_generated', {
      playlistId: result.playlistId,
      title: result.title,
      trackCount: result.trackCount,
    });
    invalidatePlatformConnectionsCache();
    revalidatePath(APP_ROUTES.ADMIN_PLATFORM_CONNECTIONS);
    revalidatePath(APP_ROUTES.ADMIN_PLAYLISTS);

    return {
      success: true,
      message: 'Test playlist generated and queued for review.',
      playlistId: result.playlistId,
    };
  } catch (error) {
    captureError('[Admin Platform Connections] Test generation failed', error);
    return {
      success: false,
      message: actionErrorMessage(error, 'Test playlist generation failed.'),
    };
  }
}
