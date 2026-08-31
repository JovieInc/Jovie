import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { CONNECTOR_PROVIDERS } from '@/lib/connectors/registry';
import { validateYouTubeProfileMutationRequest } from '@/lib/connectors/youtube/profile-request';
import { refreshConnectedYouTubeAccount } from '@/lib/connectors/youtube/refresh';
import { db } from '@/lib/db';
import { connectorAccounts } from '@/lib/db/schema/connectors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const validation = await validateYouTubeProfileMutationRequest(request);
  if (!validation.ok) return validation.response;
  const { userId, creatorProfileId } = validation;

  const [account] = await db
    .select({
      id: connectorAccounts.id,
      channelId: connectorAccounts.providerAccountId,
    })
    .from(connectorAccounts)
    .where(
      and(
        eq(connectorAccounts.userId, userId),
        eq(connectorAccounts.creatorProfileId, creatorProfileId),
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
    creatorProfileId,
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
