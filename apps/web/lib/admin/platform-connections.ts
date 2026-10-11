import 'server-only';

import { and, desc, eq, isNull, lte, or } from 'drizzle-orm';
import { CONNECTOR_PROVIDERS } from '@/lib/connectors/registry';
import { loadFreshSpotifyAccessToken } from '@/lib/connectors/spotify/access-token';
import { getSpotifyAccountProfile } from '@/lib/connectors/spotify/provider';
import { db } from '@/lib/db';
import { adminSystemSettings } from '@/lib/db/schema/admin';
import { users } from '@/lib/db/schema/auth';
import { connectorAccounts } from '@/lib/db/schema/connectors';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { REQUIRED_PLAYLIST_SPOTIFY_SCOPES } from '@/lib/spotify/system-account';

export const PLAYLIST_INTERVAL_UNITS = ['hours', 'days', 'weeks'] as const;
export type PlaylistIntervalUnit = (typeof PLAYLIST_INTERVAL_UNITS)[number];

const SETTINGS_ROW_ID = 1;
const PLAYLIST_GENERATION_LEASE_MS = 15 * 60 * 1000;

type SettingsRow = typeof adminSystemSettings.$inferSelect;

export interface PlaylistEngineSettings {
  readonly enabled: boolean;
  readonly intervalValue: number;
  readonly intervalUnit: PlaylistIntervalUnit;
  readonly lastGeneratedAt: Date | null;
  readonly nextEligibleAt: Date | null;
}

export interface PlaylistGenerationLease {
  readonly claimed: boolean;
  readonly claimedAt: Date;
  readonly leaseExpiresAt: Date;
}

export interface PlaylistSpotifyStatus {
  readonly connected: boolean;
  readonly healthy: boolean;
  readonly source: 'database' | 'env fallback' | 'missing';
  readonly clerkUserId: string | null;
  readonly accountLabel: string | null;
  readonly approvedScopes: string[];
  readonly missingScopes: string[];
  readonly updatedAt: Date | null;
  readonly updatedByUserId: string | null;
  readonly error: string | null;
}

export interface SetPlaylistEngineSettingsInput {
  readonly enabled: boolean;
  readonly intervalValue: number;
  readonly intervalUnit: PlaylistIntervalUnit;
}

export interface SetPlaylistSpotifyInput {
  readonly clerkUserId: string;
  readonly updatedByUserId: string;
}

function isIntervalUnit(value: string): value is PlaylistIntervalUnit {
  return PLAYLIST_INTERVAL_UNITS.includes(value as PlaylistIntervalUnit);
}

function normalizeIntervalUnit(value: string | null): PlaylistIntervalUnit {
  return value && isIntervalUnit(value) ? value : 'days';
}

function normalizeIntervalValue(value: number | null): number {
  if (!Number.isInteger(value) || value == null || value < 1) return 3;
  return value;
}

function getEnvFallbackClerkUserId(): string | null {
  return env.JOVIE_SYSTEM_CLERK_USER_ID?.trim() || null;
}

async function readSettingsRow(): Promise<SettingsRow | null> {
  const [settings] = await db
    .select()
    .from(adminSystemSettings)
    .where(eq(adminSystemSettings.id, SETTINGS_ROW_ID))
    .limit(1);

  return settings ?? null;
}

export function invalidatePlatformConnectionsCache(): void {
  // Settings are read directly from the database because these controls gate
  // cron and publisher behavior across multiple server instances.
}

export async function getPlaylistSpotifyClerkUserId(): Promise<string | null> {
  const settings = await readSettingsRow();
  return settings?.playlistSpotifyClerkUserId?.trim() || null;
}

export async function getPlaylistEngineSettings(): Promise<PlaylistEngineSettings> {
  const settings = await readSettingsRow();
  return {
    enabled: settings?.playlistEngineEnabled ?? false,
    intervalValue: normalizeIntervalValue(
      settings?.playlistGenerationIntervalValue ?? null
    ),
    intervalUnit: normalizeIntervalUnit(
      settings?.playlistGenerationIntervalUnit ?? null
    ),
    lastGeneratedAt: settings?.playlistLastGeneratedAt ?? null,
    nextEligibleAt: settings?.playlistNextEligibleAt ?? null,
  };
}

export function calculateNextEligibleAt(
  from: Date,
  value: number,
  unit: PlaylistIntervalUnit
): Date {
  const multipliers: Record<PlaylistIntervalUnit, number> = {
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
    weeks: 7 * 24 * 60 * 60 * 1000,
  };
  return new Date(from.getTime() + value * multipliers[unit]);
}

export async function setPlaylistEngineSettings(
  input: SetPlaylistEngineSettingsInput
): Promise<PlaylistEngineSettings> {
  if (!Number.isInteger(input.intervalValue) || input.intervalValue < 1) {
    throw new Error('Playlist generation interval must be at least 1.');
  }
  if (!isIntervalUnit(input.intervalUnit)) {
    throw new Error('Playlist generation interval unit is invalid.');
  }

  const [settings] = await db
    .insert(adminSystemSettings)
    .values({
      id: SETTINGS_ROW_ID,
      playlistEngineEnabled: input.enabled,
      playlistGenerationIntervalValue: input.intervalValue,
      playlistGenerationIntervalUnit: input.intervalUnit,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: adminSystemSettings.id,
      set: {
        playlistEngineEnabled: input.enabled,
        playlistGenerationIntervalValue: input.intervalValue,
        playlistGenerationIntervalUnit: input.intervalUnit,
        updatedAt: new Date(),
      },
    })
    .returning();

  invalidatePlatformConnectionsCache();

  return {
    enabled: settings?.playlistEngineEnabled ?? input.enabled,
    intervalValue: normalizeIntervalValue(
      settings?.playlistGenerationIntervalValue ?? input.intervalValue
    ),
    intervalUnit: normalizeIntervalUnit(
      settings?.playlistGenerationIntervalUnit ?? input.intervalUnit
    ),
    lastGeneratedAt: settings?.playlistLastGeneratedAt ?? null,
    nextEligibleAt: settings?.playlistNextEligibleAt ?? null,
  };
}

async function getAppUserId(userId: string): Promise<string | null> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user?.id ?? null;
}

/**
 * Canonical Spotify connection lookup — reads the shared `connector_accounts`
 * primitive (provider `spotify`) instead of the retired Clerk external-account
 * path. The same row powers artist integrations on Jovie and the company
 * publisher on Ovie; only the owning user differs.
 */
export async function getSpotifyConnectorAccount(userId: string) {
  const [account] = await db
    .select({
      id: connectorAccounts.id,
      status: connectorAccounts.status,
      scopes: connectorAccounts.scopes,
      providerAccountId: connectorAccounts.providerAccountId,
      updatedAt: connectorAccounts.updatedAt,
    })
    .from(connectorAccounts)
    .where(
      and(
        eq(connectorAccounts.userId, userId),
        eq(connectorAccounts.provider, CONNECTOR_PROVIDERS.spotify)
      )
    )
    .orderBy(desc(connectorAccounts.updatedAt))
    .limit(1);

  return account ?? null;
}

export async function validatePlaylistSpotifyAccount(
  userId: string
): Promise<PlaylistSpotifyStatus> {
  const account = await getSpotifyConnectorAccount(userId);
  if (!account || account.status === 'disabled') {
    return {
      connected: false,
      healthy: false,
      source: 'missing',
      clerkUserId: userId,
      accountLabel: null,
      approvedScopes: [],
      missingScopes: [...REQUIRED_PLAYLIST_SPOTIFY_SCOPES],
      updatedAt: null,
      updatedByUserId: null,
      error: 'Spotify is not connected to this account.',
    };
  }

  const approvedScopes = [...account.scopes];
  const missingScopes = REQUIRED_PLAYLIST_SPOTIFY_SCOPES.filter(
    scope => !approvedScopes.includes(scope)
  );

  if (missingScopes.length > 0) {
    return {
      connected: true,
      healthy: false,
      source: 'database',
      clerkUserId: userId,
      accountLabel: account.providerAccountId,
      approvedScopes,
      missingScopes,
      updatedAt: account.updatedAt,
      updatedByUserId: null,
      error: 'Spotify is connected but missing required playlist scopes.',
    };
  }

  try {
    const token = await loadFreshSpotifyAccessToken(account.id);
    if (!token) {
      return {
        connected: true,
        healthy: false,
        source: 'database',
        clerkUserId: userId,
        accountLabel: account.providerAccountId,
        approvedScopes,
        missingScopes: [],
        updatedAt: account.updatedAt,
        updatedByUserId: null,
        error: 'Spotify token is unavailable. Reconnect Spotify.',
      };
    }
    const profile = await getSpotifyAccountProfile({ accessToken: token });

    return {
      connected: true,
      healthy: true,
      source: 'database',
      clerkUserId: userId,
      accountLabel: profile.label,
      approvedScopes,
      missingScopes: [],
      updatedAt: account.updatedAt,
      updatedByUserId: null,
      error: null,
    };
  } catch (error) {
    captureError(
      '[Admin Platform Connections] Spotify validation failed',
      error,
      {
        clerkUserId: userId,
      }
    );
    return {
      connected: true,
      healthy: false,
      source: 'database',
      clerkUserId: userId,
      accountLabel: account.providerAccountId,
      approvedScopes,
      missingScopes: [],
      updatedAt: account.updatedAt,
      updatedByUserId: null,
      error:
        error instanceof Error ? error.message : 'Spotify health check failed.',
    };
  }
}

export async function setPlaylistSpotifyClerkUserId(
  input: SetPlaylistSpotifyInput
): Promise<void> {
  const status = await validatePlaylistSpotifyAccount(input.clerkUserId);
  if (!status.connected || !status.healthy || status.missingScopes.length > 0) {
    throw new Error(
      status.error ?? 'Spotify publisher account is not healthy.'
    );
  }

  const appUserId = await getAppUserId(input.updatedByUserId);
  const now = new Date();

  await db
    .insert(adminSystemSettings)
    .values({
      id: SETTINGS_ROW_ID,
      playlistSpotifyClerkUserId: input.clerkUserId,
      playlistSpotifyUpdatedAt: now,
      playlistSpotifyUpdatedBy: appUserId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: adminSystemSettings.id,
      set: {
        playlistSpotifyClerkUserId: input.clerkUserId,
        playlistSpotifyUpdatedAt: now,
        playlistSpotifyUpdatedBy: appUserId,
        updatedAt: now,
      },
    });

  invalidatePlatformConnectionsCache();
}

function determinePlaylistSpotifySource(
  dbClerkUserId: string | null,
  envClerkUserId: string | null
): PlaylistSpotifyStatus['source'] {
  if (dbClerkUserId) return 'database';
  if (envClerkUserId) return 'env fallback';
  return 'missing';
}

export async function getPlaylistSpotifyStatus(): Promise<PlaylistSpotifyStatus> {
  const settings = await readSettingsRow();
  const dbClerkUserId = settings?.playlistSpotifyClerkUserId?.trim() || null;
  const envClerkUserId = getEnvFallbackClerkUserId();
  const clerkUserId = dbClerkUserId ?? envClerkUserId;
  const source = determinePlaylistSpotifySource(dbClerkUserId, envClerkUserId);

  if (!clerkUserId) {
    return {
      connected: false,
      healthy: false,
      source: 'missing',
      clerkUserId: null,
      accountLabel: null,
      approvedScopes: [],
      missingScopes: [...REQUIRED_PLAYLIST_SPOTIFY_SCOPES],
      updatedAt: settings?.playlistSpotifyUpdatedAt ?? null,
      updatedByUserId: settings?.playlistSpotifyUpdatedBy ?? null,
      error:
        'Playlist Spotify publisher is not configured. Connect Spotify in Admin → Platform Connections.',
    };
  }

  const status = await validatePlaylistSpotifyAccount(clerkUserId);
  return {
    ...status,
    source,
    updatedAt: settings?.playlistSpotifyUpdatedAt ?? null,
    updatedByUserId: settings?.playlistSpotifyUpdatedBy ?? null,
  };
}

export async function markPlaylistGeneratedAt(
  generatedAt: Date
): Promise<void> {
  const settings = await getPlaylistEngineSettings();
  await db
    .insert(adminSystemSettings)
    .values({
      id: SETTINGS_ROW_ID,
      playlistLastGeneratedAt: generatedAt,
      playlistNextEligibleAt: calculateNextEligibleAt(
        generatedAt,
        settings.intervalValue,
        settings.intervalUnit
      ),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: adminSystemSettings.id,
      set: {
        playlistLastGeneratedAt: generatedAt,
        playlistNextEligibleAt: calculateNextEligibleAt(
          generatedAt,
          settings.intervalValue,
          settings.intervalUnit
        ),
        updatedAt: new Date(),
      },
    });

  invalidatePlatformConnectionsCache();
}

export async function acquirePlaylistGenerationLease(
  claimedAt: Date,
  leaseMs = PLAYLIST_GENERATION_LEASE_MS
): Promise<PlaylistGenerationLease> {
  const leaseExpiresAt = new Date(claimedAt.getTime() + leaseMs);
  const [claimed] = await db
    .update(adminSystemSettings)
    .set({
      playlistNextEligibleAt: leaseExpiresAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(adminSystemSettings.id, SETTINGS_ROW_ID),
        eq(adminSystemSettings.playlistEngineEnabled, true),
        or(
          isNull(adminSystemSettings.playlistNextEligibleAt),
          lte(adminSystemSettings.playlistNextEligibleAt, claimedAt)
        )
      )
    )
    .returning({ id: adminSystemSettings.id });

  return {
    claimed: Boolean(claimed),
    claimedAt,
    leaseExpiresAt,
  };
}

export async function releasePlaylistGenerationLease(
  lease: PlaylistGenerationLease
): Promise<void> {
  if (!lease.claimed) return;
  await db
    .update(adminSystemSettings)
    .set({
      playlistNextEligibleAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(adminSystemSettings.id, SETTINGS_ROW_ID),
        eq(adminSystemSettings.playlistNextEligibleAt, lease.leaseExpiresAt)
      )
    );

  invalidatePlatformConnectionsCache();
}
