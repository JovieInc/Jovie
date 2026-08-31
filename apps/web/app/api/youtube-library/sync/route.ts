import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { CONNECTOR_PROVIDERS } from '@/lib/connectors/registry';
import { validateYouTubeProfileMutationRequest } from '@/lib/connectors/youtube/profile-request';
import {
  type ConnectedYouTubeRefreshOutcome,
  refreshConnectedYouTubeAccount,
} from '@/lib/connectors/youtube/refresh';
import { db } from '@/lib/db';
import { connectorAccounts } from '@/lib/db/schema/connectors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const validation = await validateYouTubeProfileMutationRequest(request);
  if (!validation.ok) return validation.response;
  const { userId, creatorProfileId } = validation;

  const accounts = await db
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
    );
  if (accounts.length === 0) {
    return NextResponse.json(
      { error: 'Connect YouTube before importing videos' },
      { status: 409 }
    );
  }

  const outcomes: ConnectedYouTubeRefreshOutcome[] = [];
  for (const account of accounts) {
    outcomes.push(
      await refreshConnectedYouTubeAccount({
        connectorAccountId: account.id,
        creatorProfileId,
        channelId: account.channelId,
        source: 'manual',
      })
    );
  }

  const synced = outcomes.filter(
    (
      outcome
    ): outcome is Extract<
      ConnectedYouTubeRefreshOutcome,
      { readonly status: 'synced' }
    > => outcome.status === 'synced'
  );
  const needsReauth = outcomes.filter(
    outcome => outcome.status === 'needs_reauth'
  ).length;
  const failed = outcomes.filter(outcome => outcome.status === 'failed').length;
  const busy = outcomes.filter(outcome => outcome.status === 'busy').length;

  if (synced.length === 0) {
    if (needsReauth > 0) {
      return NextResponse.json(
        { error: 'Reconnect YouTube to refresh access' },
        { status: 409 }
      );
    }
    if (busy > 0) {
      return NextResponse.json(
        { error: 'YouTube sync already in progress' },
        { status: 409 }
      );
    }
    if (failed > 0) {
      return NextResponse.json(
        { error: 'YouTube sync failed' },
        { status: 502 }
      );
    }
  }

  if (accounts.length === 1 && synced.length === 1) {
    return NextResponse.json(synced[0].result);
  }

  return NextResponse.json({
    attempted: accounts.length,
    synced: synced.length,
    needsReauth,
    failed,
    busy,
    results: synced.map(outcome => outcome.result),
  });
}
