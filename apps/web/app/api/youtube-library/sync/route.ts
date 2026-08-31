import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { getExactProfileAccess } from '@/lib/auth/profile-access';
import { CONNECTOR_PROVIDERS } from '@/lib/connectors/registry';
import { refreshConnectedYouTubeAccount } from '@/lib/connectors/youtube/refresh';
import { db } from '@/lib/db';
import { connectorAccounts } from '@/lib/db/schema/connectors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ creatorProfileId: z.string().uuid() });

export async function POST(request: Request) {
  const { userId } = await getCachedAuth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  const access = await getExactProfileAccess(
    db,
    userId,
    parsed.data.creatorProfileId
  );
  if (!access.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [account] = await db
    .select({
      id: connectorAccounts.id,
      channelId: connectorAccounts.providerAccountId,
    })
    .from(connectorAccounts)
    .where(
      and(
        eq(connectorAccounts.userId, userId),
        eq(connectorAccounts.creatorProfileId, parsed.data.creatorProfileId),
        eq(connectorAccounts.provider, CONNECTOR_PROVIDERS.youtube),
        eq(connectorAccounts.status, 'connected')
      )
    )
    .limit(1);
  if (!account) {
    return NextResponse.json(
      { error: 'Connect YouTube before importing videos' },
      { status: 409 }
    );
  }

  const outcome = await refreshConnectedYouTubeAccount({
    connectorAccountId: account.id,
    creatorProfileId: parsed.data.creatorProfileId,
    channelId: account.channelId,
    source: 'manual',
  });
  if (outcome.status === 'needs_reauth') {
    return NextResponse.json(
      { error: 'Reconnect YouTube to refresh access' },
      { status: 409 }
    );
  }
  if (outcome.status === 'failed') {
    return NextResponse.json({ error: 'YouTube sync failed' }, { status: 502 });
  }

  return NextResponse.json(outcome.result);
}
