import 'server-only';

import { clerkClient } from '@clerk/nextjs/server';
import { and, eq, isNull, lte, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { adminSystemSettings } from '@/lib/db/schema/admin';
import { users } from '@/lib/db/schema/auth';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import {
  SPOTIFY_API_BASE,
  SPOTIFY_DEFAULT_TIMEOUT_MS,
} from '@/lib/spotify/env';
import {
  REQUIRED_PLAYLIST_SPOTIFY_SCOPES,
  SPOTIFY_EXTERNAL_ACCOUNT_PROVIDERS,
  SPOTIFY_OAUTH_TOKEN_STRATEGY,
} from '@/lib/spotify/system-account';

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
  readonly updatedByClerkUserId: string;
}

export interface SpotifyExternalAccount {
  readonly provider?: unknown;
  readonly approvedScopes?: unknown;
  readonly scope?: unknown;
  readonly scopes?: unknown;
  readonly emailAddress?: unknown;
  readonly username?: unknown;
  readonly name?: unknown;
  readonly firstName?: unknown;
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

async function getAppUserId(clerkUserId: string): Promise<string | null> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);
  return user?.id ?? null;
}

function listScopes(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((item): item is string => typeof item === 'string');
  if (typeof value === 'string') return value.split(/[,\s]+/).filter(Boolean);
  return [];
}

export function readExternalAccountScopes(account: unknown): string[] {
  if (!account || typeof account !== 'object') return [];
  const record = account as Record<string, unknown>;
  return [
    ...listScopes(record.approvedScopes),
    ...listScopes(record.scope),
    ...listScopes(record.scopes),
  ];
}

export function readAccountLabel(account: unknown): string | null {
  if (!account || typeof account !== 'object') return null;
  const record = account as Record<string, unknown>;
  for (const key of ['emailAddress', 'username', 'name', 'firstName']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function isSpotifyAccount(
  account: unknown
): account is SpotifyExternalAccount {
  if (!account || typeof account !== 'object') return false;
  const provider = (account as Record<string, unknown>).provider;
  if (typeof provider !== 'string') return false;
  return (SPOTIFY_EXTERNAL_ACCOUNT_PROVIDERS as readonly string[]).includes(
    provider
  );
}

async function getSpotifyExternalAccount(
  clerkUserId: string
): Promise<SpotifyExternalAccount | null> {
  const clerk = await clerkClient();
  const user = await clerk.users.getUser(clerkUserId);
  return user.externalAccounts.find(isSpotifyAccount) ?? null;
}

async function getSpotifyToken(clerkUserId: string): Promise<string> {
  const clerk = await clerkClient();
  const tokens = await clerk.users.getUserOauthAccessToken(
    clerkUserId,
    SPOTIFY_OAUTH_TOKEN_STRATEGY
  );
  const token = tokens.data[0]?.token;
  if (!token) throw new Error('Spotify OAuth token is unavailable.');
  return token;
}

export async function validatePlaylistSpotifyAccount(
  clerkUserId: string
): Promise<PlaylistSpotifyStatus> {
  const account = await getSpotifyExternalAccount(clerkUserId);
  if (!account) {
    return {
      connected: false,
      healthy: false,
      source: 'missing',
      clerkUserId,
      accountLabel: null,
      approvedScopes: [],
      missingScopes: [...REQUIRED_PLAYLIST_SPOTIFY_SCOPES],
      updatedAt: null,
      updatedByUserId: null,
      error: 'Spotify is not connected to this admin account.',
    };
  }

  const approvedScopes = readExternalAccountScopes(account);
  const missingScopes = REQUIRED_PLAYLIST_SPOTIFY_SCOPES.filter(
    scope => !approvedScopes.includes(scope)
  );

  if (missingScopes.length > 0) {
    return {
      connected: true,
      healthy: false,
      source: 'database',
      clerkUserId,
      accountLabel: readAccountLabel(account),
      approvedScopes,
      missingScopes,
      updatedAt: null,
      updatedByUserId: null,
      error: 'Spotify is connected but missing required playlist scopes.',
    };
  }

  try {
    const token = await getSpotifyToken(clerkUserId);
    const response = await fetch(`${SPOTIFY_API_BASE}/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(SPOTIFY_DEFAULT_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Spotify profile check failed with ${response.status}.`);
    }

    return {
      connected: true,
      healthy: true,
      source: 'database',
      clerkUserId,
      accountLabel: readAccountLabel(account),
      approvedScopes,
      missingScopes: [],
      updatedAt: null,
      updatedByUserId: null,
      error: null,
    };
  } catch (error) {
    captureError(
      '[Admin Platform Connections] Spotify validation failed',
      error,
      {
        clerkUserId,
      }
    );
    return {
      connected: true,
      healthy: false,
      source: 'database',
      clerkUserId,
      accountLabel: readAccountLabel(account),
      approvedScopes,
      missingScopes: [],
      updatedAt: null,
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

  const appUserId = await getAppUserId(input.updatedByClerkUserId);
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
