import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getCachedAuth } from '@/lib/auth/cached';
import { asConnectorStatusSql } from '@/lib/connectors/db-expressions';
import { YOUTUBE_CONNECTOR_PROVIDERS } from '@/lib/connectors/registry';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { connectorAccounts } from '@/lib/db/schema/connectors';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/connectors/youtube/disconnect
 *
 * Soft-disables the user's YouTube connector and clears encrypted tokens.
 * Does not revoke at Google — user can revoke from their Google Account.
 */
export async function POST() {
  try {
    const { userId: clerkId } = await getCachedAuth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [dbUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    for (const provider of YOUTUBE_CONNECTOR_PROVIDERS) {
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
            eq(connectorAccounts.userId, dbUser.id),
            eq(connectorAccounts.provider, provider)
          )
        );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error('[connectors/youtube/disconnect] Unexpected error', {
      error,
    });
    await captureError('YouTube connector disconnect failed', error, {
      route: '/api/connectors/youtube/disconnect',
      method: 'POST',
    });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
