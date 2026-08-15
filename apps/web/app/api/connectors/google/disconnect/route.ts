import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { asConnectorStatusSql } from '@/lib/connectors/db-expressions';
import {
  type ConnectorProviderId,
  connectorProviderSchema,
  GOOGLE_CONNECTOR_PROVIDERS,
} from '@/lib/connectors/registry';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { connectorAccounts } from '@/lib/db/schema/connectors';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  /** Which provider to disconnect. Omit to disconnect both Gmail + Google Calendar. */
  provider: connectorProviderSchema.optional(),
});

/**
 * POST /api/connectors/google/disconnect
 *
 * Marks the user's Google connector accounts as disabled.
 * Does NOT revoke the token at Google (the user can do that from their Google account
 * settings). We soft-delete by setting status='disabled' so the account row
 * persists for audit purposes.
 */
export async function POST(request: Request) {
  try {
    const { userId: clerkId } = await getCachedAuth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const [dbUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const providersToDisconnect: ConnectorProviderId[] = parsed.data.provider
      ? [parsed.data.provider]
      : [...GOOGLE_CONNECTOR_PROVIDERS];

    for (const provider of providersToDisconnect) {
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
    logger.error('[connectors/google/disconnect] Unexpected error', { error });
    await captureError('Google connector disconnect failed', error, {
      route: '/api/connectors/google/disconnect',
      method: 'POST',
    });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
