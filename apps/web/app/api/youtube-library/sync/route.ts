import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { getExactProfileAccess } from '@/lib/auth/profile-access';
import { loadFreshGoogleAccessToken } from '@/lib/connectors/google-calendar/access-token';
import { CONNECTOR_PROVIDERS } from '@/lib/connectors/registry';
import { createYouTubeLibraryProvider } from '@/lib/connectors/youtube/provider';
import { db } from '@/lib/db';
import { connectorAccounts } from '@/lib/db/schema/connectors';
import { captureError } from '@/lib/error-tracking';
import { reconcileApprovedYouTubeCollaborators } from '@/lib/library/graph-store';
import { syncChannelVideos } from '@/lib/youtube-library/sync';

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
  const accessToken = await loadFreshGoogleAccessToken(account.id);
  if (!accessToken) {
    return NextResponse.json(
      { error: 'Reconnect YouTube to refresh access' },
      { status: 409 }
    );
  }

  try {
    const result = await syncChannelVideos({
      creatorProfileId: parsed.data.creatorProfileId,
      channelId: account.channelId,
      provider: createYouTubeLibraryProvider({
        accessToken,
      }),
    });
    await reconcileApprovedYouTubeCollaborators(parsed.data.creatorProfileId);
    await db
      .update(connectorAccounts)
      .set({
        lastSyncAt: new Date(),
        lastErrorCode: null,
        lastErrorDevMessage: null,
        lastErrorUserMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(connectorAccounts.id, account.id));
    return NextResponse.json(result);
  } catch (error) {
    await db
      .update(connectorAccounts)
      .set({
        lastErrorCode: 'youtube_sync_failed',
        lastErrorDevMessage:
          error instanceof Error ? error.message : 'Unknown YouTube sync error',
        lastErrorUserMessage:
          'YouTube could not be synced. Reconnect the channel and try again.',
        updatedAt: new Date(),
      })
      .where(eq(connectorAccounts.id, account.id));
    await captureError('YouTube Library manual sync failed', error, {
      creatorProfileId: parsed.data.creatorProfileId,
      channelId: account.channelId,
    });
    return NextResponse.json({ error: 'YouTube sync failed' }, { status: 502 });
  }
}
