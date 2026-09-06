import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { getExactProfileAccess } from '@/lib/auth/profile-access';
import { loadFreshGoogleAccessToken } from '@/lib/connectors/google-calendar/access-token';
import { CONNECTOR_PROVIDERS } from '@/lib/connectors/registry';
import { applyYouTubeThumbnail } from '@/lib/connectors/youtube-thumbnail-apply';
import { db } from '@/lib/db';
import { ingestAuditLogs } from '@/lib/db/schema/audit';
import {
  connectorAccounts,
  suggestedActions,
} from '@/lib/db/schema/connectors';
import { serverFetch } from '@/lib/http/server-fetch';

const BodySchema = z.object({
  creatorProfileId: z.string().uuid(),
  approvalId: z.string().uuid(),
  artifactSha256: z.string(),
  mediaType: z.string(),
  bytesBase64: z.string(),
});

function hash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function POST(request: Request) {
  const { userId } = await getCachedAuth();
  if (!userId)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const access = await getExactProfileAccess(
    db,
    userId,
    body.data.creatorProfileId
  );
  if (!access.ok)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const [action] = await db
    .select({
      payload: suggestedActions.payload,
      status: suggestedActions.status,
      approvedAt: suggestedActions.approvedAt,
      executionResult: suggestedActions.executionResult,
    })
    .from(suggestedActions)
    .where(
      and(
        eq(suggestedActions.id, body.data.approvalId),
        eq(suggestedActions.userId, userId)
      )
    )
    .limit(1);
  if (!action)
    return NextResponse.json({ error: 'not-found' }, { status: 404 });
  if (action.status !== 'approved' || !action.approvedAt)
    return NextResponse.json({ error: 'stale-approval' }, { status: 409 });
  if (action.executionResult)
    return NextResponse.json({ error: 'replay' }, { status: 409 });

  const [account] = await db
    .select({
      id: connectorAccounts.id,
      channelId: connectorAccounts.providerAccountId,
      scopes: connectorAccounts.scopes,
    })
    .from(connectorAccounts)
    .where(
      and(
        eq(connectorAccounts.userId, userId),
        eq(connectorAccounts.creatorProfileId, body.data.creatorProfileId),
        eq(connectorAccounts.provider, CONNECTOR_PROVIDERS.youtube),
        eq(connectorAccounts.status, 'connected')
      )
    )
    .limit(1);
  if (!account)
    return NextResponse.json(
      { error: 'authorization-required' },
      { status: 409 }
    );
  const token = await loadFreshGoogleAccessToken(account.id);
  if (!token)
    return NextResponse.json(
      { error: 'authorization-required' },
      { status: 409 }
    );

  const channels = (await (
    await serverFetch(
      new URL(
        'https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true'
      ),
      {
        headers: { Authorization: `Bearer ${token}` },
        timeoutMs: 15_000,
        context: 'YouTube identity readback',
      }
    )
  ).json()) as { items?: Array<{ id?: string; snippet?: { title?: string } }> };
  const channel = channels.items?.filter(item => item.id === account.channelId);
  if (channel?.length !== 1 || !channel[0]?.snippet?.title)
    return NextResponse.json({ error: 'identity-mismatch' }, { status: 409 });
  const payload = action.payload as {
    youtubeVideoId?: string;
    videoTitle?: string;
    currentThumbnailUrl?: string | null;
  };
  if (
    !payload.youtubeVideoId ||
    !payload.videoTitle ||
    !payload.currentThumbnailUrl
  )
    return NextResponse.json({ error: 'missing-evidence' }, { status: 409 });
  const bytes = new Uint8Array(Buffer.from(body.data.bytesBase64, 'base64'));
  const currentResponse = await serverFetch(payload.currentThumbnailUrl, {
    timeoutMs: 15_000,
    context: 'YouTube thumbnail readback',
  });
  if (!currentResponse.ok)
    return NextResponse.json(
      { error: 'ambiguous-provider-state' },
      { status: 502 }
    );
  const beforeBytes = new Uint8Array(await currentResponse.arrayBuffer());

  const result = await applyYouTubeThumbnail({
    approved: action.status === 'approved',
    approvalExpiresAt: new Date(
      action.approvedAt.getTime() + 24 * 60 * 60 * 1000
    ),
    payload,
    runtimeIdentity: {
      channelId: account.channelId,
      channelTitle: channel[0].snippet.title,
      scopes: account.scopes,
    },
    videoId: payload.youtubeVideoId,
    videoTitle: payload.videoTitle,
    artifactSha256: body.data.artifactSha256,
    mediaType: body.data.mediaType,
    bytes,
    hasApplied: false,
    provider: {
      setThumbnail: async input => {
        const response = await serverFetch(
          'https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=' +
            encodeURIComponent(input.videoId),
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': input.mediaType,
            },
            body: input.bytes,
            timeoutMs: 15_000,
            context: 'YouTube thumbnail mutation',
          }
        );
        if (!response.ok) throw new Error(`provider status ${response.status}`);
        const result = (await response.json()) as {
          etag?: string;
          items?: unknown[];
        };
        if (!result.etag || !result.items?.length)
          throw new Error('ambiguous provider response');
        return {
          operationId: result.etag,
          beforeSha256: hash(beforeBytes),
          afterSha256: hash(input.bytes),
        };
      },
    },
  });
  if (!result.ok)
    return NextResponse.json({ error: result.error }, { status: 409 });
  await db.insert(ingestAuditLogs).values({
    type: 'YOUTUBE_THUMBNAIL_APPLY',
    userId,
    action: 'thumbnails.set',
    result: 'success',
    metadata: result.audit,
  });
  await db
    .update(suggestedActions)
    .set({
      status: 'executed',
      executedAt: new Date(),
      executionResult: result.audit,
    })
    .where(
      and(
        eq(suggestedActions.id, body.data.approvalId),
        eq(suggestedActions.status, 'approved')
      )
    );
  return NextResponse.json({ ok: true, receipt: result.audit });
}
