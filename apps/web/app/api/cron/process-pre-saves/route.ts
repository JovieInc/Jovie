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
    try {
      const fallbackAccess = row.encryptedAccessToken
        ? decryptPII(row.encryptedAccessToken)
        : null;
      const refreshToken = row.encryptedRefreshToken
        ? decryptPII(row.encryptedRefreshToken)
        : null;

      let accessToken = fallbackAccess;

      if (refreshToken) {
        const refreshed = await refreshSpotifyAccessToken(refreshToken);
        accessToken = refreshed.access_token;

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
      }

      const [spotifyLink] = await db
        .select({ externalId: providerLinks.externalId })
        .from(providerLinks)
        .where(
          and(
            eq(providerLinks.providerId, 'spotify'),
            eq(providerLinks.ownerType, row.trackId ? 'track' : 'release'),
            row.trackId
              ? eq(providerLinks.trackId, row.trackId)
              : eq(providerLinks.releaseId, row.releaseId)
          )
        )
        .limit(1);

      if (!accessToken || !spotifyLink?.externalId) {
        failed += 1;
        continue;
      }

      await saveReleaseToSpotifyLibrary({
        accessToken,
        spotifyReleaseId: spotifyLink.externalId,
        isTrack: !!row.trackId,
      });

      await db
        .update(preSaveTokens)
        .set({ executedAt: new Date(), updatedAt: new Date() })
        .where(eq(preSaveTokens.id, row.id));

      processed += 1;
    } catch {
      failed += 1;
    }
  }

  return NextResponse.json({ ok: true, processed, failed, total: rows.length });
}
