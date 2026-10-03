import 'server-only';

import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import {
  type NewSuggestedAction,
  suggestedActions,
} from '@/lib/db/schema/connectors';
import type { serverFetch } from '@/lib/http/server-fetch';
import type { SocialReplyAuthorKind } from '../social-reply-draft';
import { SOCIAL_REPLY_DRAFT_KIND } from '../suggested-action-kinds';
import {
  listYouTubeInboundComments,
  type YouTubeInboundComment,
} from './inbound-comments';

const INSERT_BATCH_SIZE = 50;
const MAX_INBOUND_TEXT = 4_000;
const LINK_HEAVY_MARKETING_THRESHOLD = 3;

export interface YouTubeInboundSyncResult {
  readonly fetched: number;
  readonly candidates: number;
  readonly created: number;
  readonly duplicates: number;
  readonly skipped: number;
}

function deterministicActionId(input: string): string {
  const hex = createHash('sha256').update(input).digest('hex');
  const variant = ((Number.parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(
    16
  );
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

function authorKindFor(text: string): SocialReplyAuthorKind {
  const normalized = text.toLowerCase();
  if (/\bcollab(orat(e|ion))?\b|\bfeat(ure)?\b|\bft\.\s/.test(normalized)) {
    return 'collab';
  }
  if (/\bbook(ing)?\b|\bgig\b|\bshow\b|\bvenue\b|\bperform/.test(normalized)) {
    return 'booking';
  }
  if (/\bsponsor|\bbrand deal\b|\bpartner(ship)?\b/.test(normalized)) {
    return 'sponsorship';
  }
  if (/\bpress\b|\binterview\b|\bjournalist\b|\bmedia\b/.test(normalized)) {
    return 'press';
  }
  if (/\bplaylist/.test(normalized)) {
    return 'playlist';
  }
  return 'fan';
}

function isMarketingOrBot(text: string): boolean {
  const links = text.match(/https?:\/\/|www\./giu);
  return (links?.length ?? 0) >= LINK_HEAVY_MARKETING_THRESHOLD;
}

/**
 * Deterministic v0 draft copy. Inbound sync is read-first; the draft exists so
 * the unified reply card stays valid and JOV-5130's executor has approvable
 * text once the creator edits or approves it.
 */
function draftReplyFor(comment: YouTubeInboundComment): string {
  if (comment.text.includes('?')) {
    return 'Great question — thank you for listening.';
  }
  return 'Thank you for listening — it means a lot.';
}

/**
 * Maps normalized YouTube comments to insertable `social_reply.draft` rows.
 * Skips the channel's own comments, empty text, and anything missing the ids
 * the reply executor binds to. Pure — unit-testable without a database.
 */
export function buildYouTubeInboundDraftRows(input: {
  readonly userId: string;
  readonly connectorAccountId: string;
  readonly channelId: string;
  readonly comments: readonly YouTubeInboundComment[];
}): NewSuggestedAction[] {
  const rows: NewSuggestedAction[] = [];
  for (const comment of input.comments) {
    if (comment.authorChannelId === input.channelId) continue;
    const inboundText = comment.text.slice(0, MAX_INBOUND_TEXT).trim();
    const publishedAt = new Date(comment.publishedAt);
    if (!inboundText || Number.isNaN(publishedAt.getTime())) continue;

    const actionId = deterministicActionId(
      `youtube-inbound:${input.connectorAccountId}:${comment.commentId}`
    );
    const videoLabel = comment.videoTitle ?? comment.videoId;
    rows.push({
      id: actionId,
      userId: input.userId,
      kind: SOCIAL_REPLY_DRAFT_KIND,
      targetConnectorAccountId: input.connectorAccountId,
      signalType: 'fan_reply',
      status: 'pending',
      payload: {
        schemaVersion: 1,
        title: `Reply to ${comment.authorLabel} on YouTube`.slice(0, 256),
        platform: 'youtube',
        sourceId: comment.videoId,
        targetId: comment.commentId,
        authorLabel: comment.authorLabel.slice(0, 256),
        authorKind: authorKindFor(comment.text),
        inboundText,
        inboundAt: publishedAt.toISOString(),
        rankingSignals: {
          identity: [],
          intent: [],
          unansweredInbound: !comment.creatorReplied,
          relationship: [],
          followerCount: null,
          channelSize: null,
          spam: comment.moderationStatus === 'heldForReview',
          youtubeLikelySpam: comment.moderationStatus === 'likelySpam',
          alreadyReplied: comment.creatorReplied,
          marketingOrBot: isMarketingOrBot(comment.text),
        },
        draftedText: draftReplyFor(comment),
        sourceUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(
          comment.videoId
        )}&lc=${encodeURIComponent(comment.commentId)}`,
        provenance: {
          threadId: comment.threadId,
          videoId: comment.videoId,
          videoTitle: comment.videoTitle,
          authorChannelId: comment.authorChannelId ?? undefined,
          likeCount: comment.likeCount,
          moderationStatus: comment.moderationStatus,
        },
        executionState: 'pending',
        revisions: [],
        revisionOf: null,
      },
      sourceRefs: [
        {
          connectorAccountId: input.connectorAccountId,
          sourceType: 'youtube_comment',
          sourceReference: `youtube:comment:${comment.commentId}`,
          threadId: comment.threadId,
          videoId: comment.videoId,
          likeCount: comment.likeCount,
          observedAt: publishedAt.toISOString(),
        },
      ],
      rationale: `Inbound YouTube comment on “${videoLabel}” (${comment.likeCount} likes).`,
      idempotencyKey: `youtube-comment:${actionId}`,
      sideEffects: [],
      detectedAt: publishedAt,
    });
  }
  return rows;
}

/**
 * Pulls the owned channel's comment threads into the unified inbox as
 * `social_reply.draft` suggested actions. Idempotent: action ids are
 * deterministic per comment, so re-syncs dedupe at the insert boundary.
 */
export async function syncYouTubeInboundComments(input: {
  readonly userId: string;
  readonly connectorAccountId: string;
  readonly channelId: string;
  readonly accessToken: string;
  readonly fetcher?: typeof serverFetch;
  readonly maxPages?: number;
}): Promise<YouTubeInboundSyncResult> {
  const comments = await listYouTubeInboundComments({
    accessToken: input.accessToken,
    channelId: input.channelId,
    ...(input.fetcher ? { fetcher: input.fetcher } : {}),
    ...(input.maxPages ? { maxPages: input.maxPages } : {}),
  });
  const rows = buildYouTubeInboundDraftRows({
    userId: input.userId,
    connectorAccountId: input.connectorAccountId,
    channelId: input.channelId,
    comments,
  });

  let created = 0;
  for (let index = 0; index < rows.length; index += INSERT_BATCH_SIZE) {
    const inserted = await db
      .insert(suggestedActions)
      .values(rows.slice(index, index + INSERT_BATCH_SIZE))
      .onConflictDoNothing()
      .returning({ id: suggestedActions.id });
    created += inserted.length;
  }

  return {
    fetched: comments.length,
    candidates: rows.length,
    created,
    duplicates: rows.length - created,
    skipped: comments.length - rows.length,
  };
}
