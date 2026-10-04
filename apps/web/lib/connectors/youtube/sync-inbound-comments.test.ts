import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: { insert: vi.fn() },
}));

import { db } from '@/lib/db';
import { rankSocialInboxDrafts } from '../social-inbox-ranker';
import { parseSocialReplyDraft } from '../social-reply-draft';
import { SOCIAL_REPLY_DRAFT_KIND } from '../suggested-action-kinds';
import type { YouTubeInboundComment } from './inbound-comments';
import { listYouTubeInboundComments } from './inbound-comments';
import {
  buildYouTubeInboundDraftRows,
  syncYouTubeInboundComments,
} from './sync-inbound-comments';

vi.mock('./inbound-comments', () => ({
  listYouTubeInboundComments: vi.fn(),
}));

const USER_ID = '10000000-0000-4000-8000-000000000001';
const CONNECTOR_ACCOUNT_ID = '20000000-0000-4000-8000-000000000001';
const CHANNEL_ID = 'UCchannel-1';

function comment(overrides: Partial<YouTubeInboundComment> = {}) {
  return {
    threadId: 'thread-1',
    commentId: 'comment-1',
    videoId: 'video-1',
    videoTitle: 'Midnight Drive (Live)',
    authorChannelId: 'UCfan-1',
    authorLabel: '@superfan',
    text: 'This track got me through the week, thank you.',
    likeCount: 12,
    publishedAt: '2026-09-30T14:00:00.000Z',
    moderationStatus: 'published',
    creatorReplied: false,
    ...overrides,
  } satisfies YouTubeInboundComment;
}

function mockInsert(createdPerBatch: number[]) {
  let call = 0;
  const returning = vi.fn(async () =>
    Array.from({ length: createdPerBatch[call++] ?? 0 }, (_, index) => ({
      id: `inserted-${index}`,
    }))
  );
  const onConflictDoNothing = vi.fn(() => ({ returning }));
  const values = vi.fn((_rows: readonly unknown[]) => ({
    onConflictDoNothing,
  }));
  vi.mocked(db.insert).mockReturnValue({ values } as never);
  return { values, returning };
}

describe('buildYouTubeInboundDraftRows', () => {
  it('builds a parseable social_reply.draft row with full provenance', () => {
    const [row] = buildYouTubeInboundDraftRows({
      userId: USER_ID,
      connectorAccountId: CONNECTOR_ACCOUNT_ID,
      channelId: CHANNEL_ID,
      comments: [comment()],
    });

    expect(row.kind).toBe(SOCIAL_REPLY_DRAFT_KIND);
    expect(row.signalType).toBe('fan_reply');
    expect(row.status).toBe('pending');
    expect(row.targetConnectorAccountId).toBe(CONNECTOR_ACCOUNT_ID);

    const draft = parseSocialReplyDraft(SOCIAL_REPLY_DRAFT_KIND, row.payload);
    expect(draft).not.toBeNull();
    expect(draft).toMatchObject({
      platform: 'youtube',
      sourceId: 'video-1',
      targetId: 'comment-1',
      authorLabel: '@superfan',
      authorKind: 'fan',
      inboundAt: '2026-09-30T14:00:00.000Z',
      sourceUrl: 'https://www.youtube.com/watch?v=video-1&lc=comment-1',
      executionState: 'pending',
    });
    expect(draft?.provenance).toEqual({
      threadId: 'thread-1',
      videoId: 'video-1',
      videoTitle: 'Midnight Drive (Live)',
      authorChannelId: 'UCfan-1',
      likeCount: 12,
      moderationStatus: 'published',
    });
  });

  it('produces deterministic action ids for at-most-once sync', () => {
    const input = {
      userId: USER_ID,
      connectorAccountId: CONNECTOR_ACCOUNT_ID,
      channelId: CHANNEL_ID,
      comments: [comment()],
    };
    const [first] = buildYouTubeInboundDraftRows(input);
    const [second] = buildYouTubeInboundDraftRows(input);
    expect(first.id).toBe(second.id);
    expect(first.idempotencyKey).toBe(`youtube-comment:${first.id}`);
  });

  it('skips the channel’s own comments and malformed inbound text', () => {
    const rows = buildYouTubeInboundDraftRows({
      userId: USER_ID,
      connectorAccountId: CONNECTOR_ACCOUNT_ID,
      channelId: CHANNEL_ID,
      comments: [
        comment({ commentId: 'own-1', authorChannelId: CHANNEL_ID }),
        comment({ commentId: 'empty-1', text: '   ' }),
        comment({ commentId: 'undated-1', publishedAt: 'not-a-date' }),
        comment({ commentId: 'real-1' }),
      ],
    });
    expect(rows).toHaveLength(1);
  });

  it('buries held-for-review, likely-spam, and already-answered comments', () => {
    const rows = buildYouTubeInboundDraftRows({
      userId: USER_ID,
      connectorAccountId: CONNECTOR_ACCOUNT_ID,
      channelId: CHANNEL_ID,
      comments: [
        comment({ commentId: 'held-1', moderationStatus: 'heldForReview' }),
        comment({ commentId: 'spam-1', moderationStatus: 'likelySpam' }),
        comment({ commentId: 'done-1', creatorReplied: true }),
        comment({ commentId: 'fresh-1' }),
      ],
    });

    const entries = rows.map(row => {
      const draft = parseSocialReplyDraft(SOCIAL_REPLY_DRAFT_KIND, row.payload);
      return {
        draft: { ...draft!, id: row.id ?? '' },
        targetId: draft!.targetId,
      };
    });
    const ranked = rankSocialInboxDrafts(
      entries.map(entry => entry.draft),
      { now: new Date('2026-10-01T14:00:00.000Z') }
    );
    const rankedTargetIds = ranked.map(
      rankedDraft =>
        entries.find(entry => entry.draft.id === rankedDraft.id)?.targetId
    );
    expect(rankedTargetIds.slice(0, 2)).toEqual(['fresh-1', 'done-1']);
    expect(new Set(rankedTargetIds.slice(2))).toEqual(
      new Set(['held-1', 'spam-1'])
    );
  });

  it('classifies collab and booking asks as named author kinds', () => {
    const rows = buildYouTubeInboundDraftRows({
      userId: USER_ID,
      connectorAccountId: CONNECTOR_ACCOUNT_ID,
      channelId: CHANNEL_ID,
      comments: [
        comment({ commentId: 'c1', text: 'Would love to collab on a remix?' }),
        comment({ commentId: 'c2', text: 'Can we book you for our venue?' }),
      ],
    });
    expect(
      rows.map(
        row =>
          parseSocialReplyDraft(SOCIAL_REPLY_DRAFT_KIND, row.payload)
            ?.authorKind
      )
    ).toEqual(['collab', 'booking']);
  });
});

describe('syncYouTubeInboundComments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts drafts idempotently and reports counts', async () => {
    vi.mocked(listYouTubeInboundComments).mockResolvedValue([
      comment({ commentId: 'a' }),
      comment({ commentId: 'b' }),
      comment({ commentId: 'own', authorChannelId: CHANNEL_ID }),
    ]);
    const { values } = mockInsert([2]);

    const result = await syncYouTubeInboundComments({
      userId: USER_ID,
      connectorAccountId: CONNECTOR_ACCOUNT_ID,
      channelId: CHANNEL_ID,
      accessToken: 'token',
    });

    expect(result).toEqual({
      fetched: 3,
      candidates: 2,
      created: 2,
      duplicates: 0,
      skipped: 1,
    });
    expect(values).toHaveBeenCalledTimes(1);
    const inserted = values.mock.calls[0][0] as readonly { id: string }[];
    expect(inserted).toHaveLength(2);
  });

  it('reports duplicates when every comment already exists', async () => {
    vi.mocked(listYouTubeInboundComments).mockResolvedValue([comment()]);
    mockInsert([0]);

    const result = await syncYouTubeInboundComments({
      userId: USER_ID,
      connectorAccountId: CONNECTOR_ACCOUNT_ID,
      channelId: CHANNEL_ID,
      accessToken: 'token',
    });

    expect(result.created).toBe(0);
    expect(result.duplicates).toBe(1);
  });
});
