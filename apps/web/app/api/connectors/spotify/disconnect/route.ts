import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getCachedAuth } from '@/lib/auth/cached';
import { asConnectorStatusSql } from '@/lib/connectors/db-expressions';
import { CONNECTOR_PROVIDERS } from '@/lib/connectors/registry';
import { db } from '@/lib/db';
import { connectorAccounts } from '@/lib/db/schema/connectors';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/connectors/spotify/disconnect
 *
 * Marks the signed-in user's Spotify connector accounts as disabled and clears
 * stored tokens. Does NOT revoke the grant at Spotify (the user can do that
 * from their Spotify account settings).
 */
export async function POST() {
  try {
    const { userId } = await getCachedAuth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await db
      .update(connectorAccounts)
      .set({
        status: asConnectorStatusSql('disabled'),
        encryptedAccessToken: null,
        encryptedRefreshToken: null,
        tokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(connectorAccounts.userId, userId),
          eq(connectorAccounts.provider, CONNECTOR_PROVIDERS.spotify)
        )
      );

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error('[connectors/spotify/disconnect] Unexpected error', { error });
    await captureError('Spotify connector disconnect failed', error, {
      route: '/api/connectors/spotify/disconnect',
      method: 'POST',
    });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
