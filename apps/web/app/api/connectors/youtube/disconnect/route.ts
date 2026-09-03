import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { getExactProfileAccess } from '@/lib/auth/profile-access';
import { asConnectorStatusSql } from '@/lib/connectors/db-expressions';
import { CONNECTOR_PROVIDERS } from '@/lib/connectors/registry';
import { db } from '@/lib/db';
import { connectorAccounts } from '@/lib/db/schema/connectors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ creatorProfileId: z.string().uuid() });

export async function POST(request: Request) {
  const { userId } = await getCachedAuth();
  if (!userId)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  const access = await getExactProfileAccess(
    db,
    userId,
    parsed.data.creatorProfileId
  );
  if (!access.ok)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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
        eq(connectorAccounts.creatorProfileId, parsed.data.creatorProfileId),
        eq(connectorAccounts.provider, CONNECTOR_PROVIDERS.youtube)
      )
    );
  return NextResponse.json({ ok: true });
}
