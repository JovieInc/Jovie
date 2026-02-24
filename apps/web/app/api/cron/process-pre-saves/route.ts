import { and, eq, isNull, lte } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { discogReleases, providerLinks } from '@/lib/db/schema/content';
import { preSaveTokens } from '@/lib/db/schema/pre-save';
import { env } from '@/lib/env-server';
import {
  refreshSpotifyAccessToken,
  saveReleaseToSpotifyLibrary,
} from '@/lib/pre-save/spotify';
import { decryptPII, encryptPII } from '@/lib/utils/pii-encryption';

async function resolveAccessToken(row: {
  id: string;
  encryptedAccessToken: string | null;
  encryptedRefreshToken: string | null;
}): Promise<string | null> {
  const fallbackAccess = row.encryptedAccessToken
    ? decryptPII(row.encryptedAccessToken)
    : null;
  const refreshToken = row.encryptedRefreshToken
    ? decryptPII(row.encryptedRefreshToken)
    : null;

  if (!refreshToken) return fallbackAccess;

  const refreshed = await refreshSpotifyAccessToken(refreshToken);

  await db
    .update(preSaveTokens)
    .set({
      encryptedAccessToken: encryptPII(refreshed.access_token),
      encryptedRefreshToken: refreshed.refresh_token
        ? encryptPII(refreshed.refresh_token)
        : row.encryptedRefreshToken,
      updatedAt: new Date(),
    })
    .where(eq(preSaveTokens.id, row.id));

  return refreshed.access_token;
}

async function findSpotifyExternalId(
  releaseId: string,
  trackId: string | null
): Promise<string | null> {
  const [spotifyLink] = await db
    .select({ externalId: providerLinks.externalId })
    .from(providerLinks)
    .where(
      and(
        eq(providerLinks.providerId, 'spotify'),
        eq(providerLinks.ownerType, trackId ? 'track' : 'release'),
        trackId
          ? eq(providerLinks.trackId, trackId)
          : eq(providerLinks.releaseId, releaseId)
      )
    )
    .limit(1);

  return spotifyLink?.externalId ?? null;
}

async function processPreSaveRow(row: {
  id: string;
  releaseId: string;
  trackId: string | null;
  encryptedRefreshToken: string | null;
  encryptedAccessToken: string | null;
}): Promise<boolean> {
  try {
    // Check for Spotify link first to avoid unnecessary token refresh
    const externalId = await findSpotifyExternalId(row.releaseId, row.trackId);
    if (!externalId) return false;

    const accessToken = await resolveAccessToken(row);
    if (!accessToken) return false;

    await saveReleaseToSpotifyLibrary({
      accessToken,
      spotifyReleaseId: externalId,
      isTrack: !!row.trackId,
    });

    await db
      .update(preSaveTokens)
      .set({ executedAt: new Date(), updatedAt: new Date() })
      .where(eq(preSaveTokens.id, row.id));

    return true;
  } catch (error) {
    console.error(`[pre-save] Failed to process row ${row.id}:`, error);
    return false;
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const secret = authHeader?.replace('Bearer ', '');

  if (!secret || secret !== env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rows = await db
    .select({
      id: preSaveTokens.id,
      releaseId: preSaveTokens.releaseId,
      trackId: preSaveTokens.trackId,
      encryptedRefreshToken: preSaveTokens.encryptedRefreshToken,
      encryptedAccessToken: preSaveTokens.encryptedAccessToken,
    })
    .from(preSaveTokens)
    .innerJoin(discogReleases, eq(discogReleases.id, preSaveTokens.releaseId))
    .where(
      and(
        eq(preSaveTokens.provider, 'spotify'),
        isNull(preSaveTokens.executedAt),
        lte(discogReleases.releaseDate, new Date())
      )
    )
    .limit(500);

  let processed = 0;
  let failed = 0;

  for (const row of rows) {
    const success = await processPreSaveRow(row);
    if (success) {
      processed += 1;
    } else {
      failed += 1;
    }
  }

  return NextResponse.json({ ok: true, processed, failed, total: rows.length });
}
