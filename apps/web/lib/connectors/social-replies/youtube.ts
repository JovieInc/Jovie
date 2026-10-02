import 'server-only';

import {
  listOwnedYouTubeChannels,
  YouTubeProviderError,
} from '@/lib/connectors/youtube/provider';
import { serverFetch } from '@/lib/http/server-fetch';
import {
  normalizeReplyText,
  type SocialReplyAdapter,
  type SocialReplyPreflight,
  type SocialReplyTarget,
  type SocialReplyVerificationResult,
  type SocialReplyWriteResult,
} from './contract';

const YOUTUBE_DATA_API = 'https://www.googleapis.com/youtube/v3';
const COMMENT_PART = 'id,snippet';
const MAX_REPLY_PAGE = 100;

/** Identity resolutions are reused for one bounded lease, then revalidated. */
const DEFAULT_IDENTITY_LEASE_MS = 120_000;

type ProviderFetch = typeof serverFetch;

interface CommentSnippet {
  readonly videoId?: string;
  readonly parentId?: string;
  readonly textOriginal?: string;
  readonly authorChannelId?: { readonly value?: string };
}

interface CommentResource {
  readonly id?: string;
  readonly etag?: string;
  readonly snippet?: CommentSnippet;
}

interface CommentsListResponse {
  readonly items?: readonly CommentResource[];
}

interface VideosStatusResponse {
  readonly items?: readonly {
    readonly id?: string;
    readonly snippet?: { readonly channelId?: string };
    readonly status?: { readonly privacyStatus?: string };
  }[];
}

export interface YouTubeReplyAdapterInput {
  /** OAuth access token for the connected YouTube connector account. */
  readonly accessToken: string;
  /**
   * The exact channel ID stored on the connector account
   * (`connector_accounts.provider_account_id`). Every write revalidates that
   * the authorized account still owns this channel.
   */
  readonly channelId: string;
  readonly fetcher?: ProviderFetch;
  readonly now?: () => Date;
  /** How long a resolved channel identity may be reused before revalidation. */
  readonly identityLeaseMs?: number;
}

interface ResolvedIdentity {
  readonly channelId: string;
  readonly channelTitle: string;
  readonly resolvedAt: number;
}

function authorChannelId(comment: CommentResource): string | null {
  return comment.snippet?.authorChannelId?.value?.trim() || null;
}

async function authorizedJson<T>(
  url: URL,
  accessToken: string,
  fetcher: ProviderFetch,
  context: string,
  init?: { readonly method?: string; readonly body?: string }
): Promise<T> {
  const response = await fetcher(url, {
    method: init?.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init?.body,
    timeoutMs: 15_000,
    context,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      readonly error?: {
        readonly status?: string;
        readonly errors?: readonly { readonly reason?: string }[];
      };
    } | null;
    throw new YouTubeProviderError(
      `${context} failed with status ${response.status}`,
      response.status,
      payload?.error?.errors?.[0]?.reason ?? payload?.error?.status ?? null
    );
  }
  return (await response.json()) as T;
}

function isCommentsDisabled(error: unknown): boolean {
  return (
    error instanceof YouTubeProviderError &&
    (error.reason === 'commentsDisabled' || error.reason === 'commentDisabled')
  );
}

/**
 * YouTube `SocialReplyAdapter` for human-approved comment replies.
 *
 * - `preflight` re-reads the target comment, its video privacy/ownership, and
 *   any existing replies authored by the connected channel immediately before
 *   the write decision — the orchestrator skips on `alreadyReplied`.
 * - `writeReply` posts a `comments.insert` reply bound to the exact parent
 *   comment; a response without an ID or whose echoed parent/text does not
 *   match the approved draft is reported `ambiguous` so nothing is retried.
 * - `verifyReply` performs the remote readback: exact reply ID, parent,
 *   author channel, and text must match or the write is ambiguous.
 * - Channel identity is resolved once and reused under a bounded lease
 *   (`identityLeaseMs`), so a batch does not re-hit `channels.list` per item,
 *   yet identity is still revalidated before writes when the lease lapses.
 */
export function createYouTubeReplyAdapter(
  input: YouTubeReplyAdapterInput
): SocialReplyAdapter {
  const fetcher = input.fetcher ?? serverFetch;
  const now = input.now ?? (() => new Date());
  const identityLeaseMs = input.identityLeaseMs ?? DEFAULT_IDENTITY_LEASE_MS;
  let identity: ResolvedIdentity | null = null;

  async function ensureIdentity(): Promise<ResolvedIdentity> {
    if (identity && now().getTime() - identity.resolvedAt < identityLeaseMs) {
      return identity;
    }
    const channels = await listOwnedYouTubeChannels({
      accessToken: input.accessToken,
      fetcher,
    });
    const channel = channels.find(item => item.id === input.channelId);
    if (!channel) {
      throw new YouTubeProviderError(
        'The authorized account no longer owns the connected YouTube channel',
        403,
        'channelMismatch'
      );
    }
    identity = {
      channelId: channel.id,
      channelTitle: channel.title,
      resolvedAt: now().getTime(),
    };
    return identity;
  }

  async function fetchComment(commentId: string, context: string) {
    const url = new URL(`${YOUTUBE_DATA_API}/comments`);
    url.searchParams.set('part', COMMENT_PART);
    url.searchParams.set('id', commentId);
    const data = await authorizedJson<CommentsListResponse>(
      url,
      input.accessToken,
      fetcher,
      context
    );
    return data.items?.[0] ?? null;
  }

  async function listCreatorReplies(parentId: string, channelId: string) {
    const url = new URL(`${YOUTUBE_DATA_API}/comments`);
    url.searchParams.set('part', COMMENT_PART);
    url.searchParams.set('parentId', parentId);
    url.searchParams.set('maxResults', String(MAX_REPLY_PAGE));
    const data = await authorizedJson<CommentsListResponse>(
      url,
      input.accessToken,
      fetcher,
      'YouTube reply recheck'
    );
    return (data.items ?? []).filter(
      item => authorChannelId(item) === channelId
    );
  }

  return {
    platform: 'youtube',

    async preflight(target: SocialReplyTarget): Promise<SocialReplyPreflight> {
      const resolved = await ensureIdentity();
      const baselineMetadata: Record<string, unknown> = {
        channelId: resolved.channelId,
        channelTitle: resolved.channelTitle,
      };

      const videoUrl = new URL(`${YOUTUBE_DATA_API}/videos`);
      videoUrl.searchParams.set('part', 'snippet,status');
      videoUrl.searchParams.set('id', target.sourceId);
      const video = (
        await authorizedJson<VideosStatusResponse>(
          videoUrl,
          input.accessToken,
          fetcher,
          'YouTube video status'
        )
      ).items?.[0];
      if (
        !video ||
        video.snippet?.channelId !== resolved.channelId ||
        video.status?.privacyStatus !== 'public'
      ) {
        return {
          isPublic: false,
          canReply: false,
          existingReplyCount: 0,
          alreadyReplied: false,
          checkedAt: now().toISOString(),
          baselineMetadata,
        };
      }

      let comment: CommentResource | null = null;
      try {
        comment = await fetchComment(target.targetId, 'YouTube comment lookup');
      } catch (error) {
        if (isCommentsDisabled(error)) {
          return {
            isPublic: true,
            canReply: false,
            existingReplyCount: 0,
            alreadyReplied: false,
            checkedAt: now().toISOString(),
            baselineMetadata,
          };
        }
        throw error;
      }

      if (!comment || comment.snippet?.videoId !== target.sourceId) {
        return {
          isPublic: true,
          canReply: false,
          existingReplyCount: 0,
          alreadyReplied: false,
          checkedAt: now().toISOString(),
          baselineMetadata,
        };
      }

      const ownReplies = await listCreatorReplies(
        target.targetId,
        resolved.channelId
      );
      return {
        isPublic: true,
        canReply: true,
        existingReplyCount: ownReplies.length,
        alreadyReplied: ownReplies.length > 0,
        checkedAt: now().toISOString(),
        baselineMetadata,
      };
    },

    async writeReply(
      target: SocialReplyTarget
    ): Promise<SocialReplyWriteResult> {
      await ensureIdentity();
      const url = new URL(`${YOUTUBE_DATA_API}/comments`);
      url.searchParams.set('part', 'snippet');
      const data = await authorizedJson<CommentResource>(
        url,
        input.accessToken,
        fetcher,
        'YouTube reply write',
        {
          method: 'POST',
          body: JSON.stringify({
            snippet: {
              parentId: target.targetId,
              textOriginal: target.draftedText,
            },
          }),
        }
      );

      const replyId = data.id?.trim();
      if (!replyId) {
        return {
          status: 'ambiguous',
          reason: 'YouTube reply write returned no comment ID.',
          providerMetadata: {},
        };
      }
      if (
        data.snippet?.parentId !== target.targetId ||
        data.snippet?.textOriginal !== target.draftedText
      ) {
        return {
          status: 'ambiguous',
          reason: 'YouTube reply write echoed a different destination or copy.',
          providerMetadata: { providerReplyId: replyId },
        };
      }
      return {
        status: 'written',
        providerReplyId: replyId,
        providerMetadata: data.etag ? { etag: data.etag } : {},
      };
    },

    async verifyReply(
      target: SocialReplyTarget,
      writeResult
    ): Promise<SocialReplyVerificationResult> {
      const resolved = await ensureIdentity();
      const verifiedAt = now().toISOString();
      const comment = await fetchComment(
        writeResult.providerReplyId,
        'YouTube reply readback'
      );
      if (!comment) {
        return {
          status: 'not-found',
          reason: 'The written reply was not returned by comments.list.',
          verifiedAt,
          providerMetadata: {},
        };
      }
      if (
        authorChannelId(comment) !== resolved.channelId ||
        comment.snippet?.parentId !== target.targetId ||
        comment.snippet?.textOriginal !== target.draftedText ||
        normalizeReplyText(comment.snippet?.textOriginal ?? '') !==
          normalizeReplyText(target.draftedText)
      ) {
        return {
          status: 'mismatch',
          reason:
            'Readback did not match the approved author, parent, or copy.',
          verifiedAt,
          providerMetadata: { providerReplyId: writeResult.providerReplyId },
        };
      }
      return {
        status: 'verified',
        providerReplyId: writeResult.providerReplyId,
        verifiedText: comment.snippet?.textOriginal ?? target.draftedText,
        verifiedAt,
        providerMetadata: comment.etag ? { etag: comment.etag } : {},
      };
    },
  };
}
