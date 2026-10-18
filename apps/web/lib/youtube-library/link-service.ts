import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { BASE_URL } from '@/constants/domains';
import { loadFreshGoogleAccessToken } from '@/lib/connectors/google-calendar/access-token';
import { CONNECTOR_PROVIDERS } from '@/lib/connectors/registry';
import { createYouTubeSnippetWriter } from '@/lib/connectors/youtube/provider';
import { db } from '@/lib/db';
import { connectorAccounts } from '@/lib/db/schema/connectors';
import { discogReleases } from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  youtubeVideoReleaseLinks,
  youtubeVideos,
} from '@/lib/db/schema/youtube-library';
import {
  approvalFromPlan,
  sourceVersionFor,
  YOUTUBE_LINK_WRITE_SCOPE,
} from './link-apply';
import type { YouTubeLinkPreview } from './link-contract';
import { buildExpectedJovieUrl, inspectYouTubeLink } from './link-inspect';
import { loadYouTubeLinkOperation } from './link-store';

export async function loadYouTubeLinkContext(
  userId: string,
  creatorProfileId: string,
  videoId: string
) {
  const [row] = await db
    .select({
      video: youtubeVideos,
      handle: creatorProfiles.username,
      releaseSlug: discogReleases.slug,
      accountId: connectorAccounts.id,
      scopes: connectorAccounts.scopes,
    })
    .from(youtubeVideos)
    .innerJoin(
      creatorProfiles,
      eq(creatorProfiles.id, youtubeVideos.creatorProfileId)
    )
    .leftJoin(
      youtubeVideoReleaseLinks,
      and(
        eq(youtubeVideoReleaseLinks.videoId, youtubeVideos.id),
        eq(youtubeVideoReleaseLinks.status, 'approved')
      )
    )
    .leftJoin(
      discogReleases,
      and(
        eq(discogReleases.id, youtubeVideoReleaseLinks.releaseId),
        eq(discogReleases.creatorProfileId, creatorProfileId),
        isNull(discogReleases.deletedAt)
      )
    )
    .leftJoin(
      connectorAccounts,
      and(
        eq(connectorAccounts.userId, userId),
        eq(connectorAccounts.creatorProfileId, creatorProfileId),
        eq(connectorAccounts.provider, CONNECTOR_PROVIDERS.youtube),
        eq(connectorAccounts.providerAccountId, youtubeVideos.channelId),
        eq(connectorAccounts.status, 'connected')
      )
    )
    .where(
      and(
        eq(youtubeVideos.creatorProfileId, creatorProfileId),
        eq(youtubeVideos.videoId, videoId)
      )
    )
    .limit(1);
  if (!row) return null;
  const expectedUrl = buildExpectedJovieUrl({
    origin: BASE_URL,
    handle: row.handle,
    releaseSlug: row.releaseSlug,
  });
  if (!expectedUrl) return null;
  return { ...row, expectedUrl };
}
export type YouTubeLinkContext = NonNullable<
  Awaited<ReturnType<typeof loadYouTubeLinkContext>>
>;

export async function loadYouTubeLinkWriter(context: YouTubeLinkContext) {
  if (!context.accountId) return null;
  const accessToken = await loadFreshGoogleAccessToken(context.accountId);
  if (!accessToken) return null;
  const writer = createYouTubeSnippetWriter({ accessToken });
  // Confirm the live resource belongs to the imported channel on EVERY read.
  return {
    ...writer,
    getVideo: async (videoId: string) => {
      const live = await writer.getVideo(videoId);
      return live?.id === context.video.videoId &&
        live.snippet.channelId === context.video.channelId
        ? live
        : null;
    },
  };
}

export async function previewYouTubeLink(
  context: YouTubeLinkContext
): Promise<YouTubeLinkPreview> {
  const inspect = (description: string | null) =>
    inspectYouTubeLink({
      description,
      expectedUrl: context.expectedUrl,
      videoUrl: context.video.url,
      extraHosts: [new URL(BASE_URL).hostname],
    });
  const unknown = (message: string): YouTubeLinkPreview => ({
    plan: {
      ...inspect(context.video.description),
      status: 'unknown',
      action: 'none',
      nextAction: message,
    },
    approval: null,
    rollback: null,
  });
  const writer = await loadYouTubeLinkWriter(context);
  if (!writer) return unknown('Reconnect YouTube to inspect this description.');
  const live = await writer.getVideo(context.video.videoId);
  if (!live)
    return unknown(
      'Refresh the imported video or reconnect its YouTube channel.'
    );
  const plan = inspect(live.snippet.description);
  const canWrite =
    context.scopes?.includes(YOUTUBE_LINK_WRITE_SCOPE) && Boolean(live.etag);
  const operation = context.accountId
    ? await loadYouTubeLinkOperation(context.accountId, context.video.videoId)
    : null;
  const sourceVersion = sourceVersionFor(live.snippet.description, live.etag);
  return {
    plan: canWrite
      ? plan
      : {
          ...plan,
          nextAction: 'Reconnect YouTube with description editing access.',
        },
    approval:
      canWrite && plan.action !== 'none' && !plan.blockedReason
        ? approvalFromPlan({ videoId: live.id, plan, sourceVersion })
        : null,
    rollback:
      canWrite &&
      operation &&
      operation.status !== 'rolled-back' &&
      operation.originalDescription !== operation.proposedDescription &&
      live.snippet.description === operation.proposedDescription
        ? {
            operationKey: operation.idempotencyKey,
            originalDescription: operation.originalDescription,
            sourceVersion,
          }
        : null,
  };
}
