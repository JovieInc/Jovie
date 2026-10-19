import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, expect, it, vi } from 'vitest';
import { YOUTUBE_LINK_WRITE_SCOPE } from './link-apply';
import {
  loadYouTubeLinkContext,
  loadYouTubeLinkWriter,
  previewYouTubeLink,
} from './link-service';
import { withYouTubeLinkStore, YouTubeLinkBusyError } from './link-store';

const m = vi.hoisted(() => ({
  rows: [] as unknown[][],
  where: vi.fn(),
  insert: vi.fn(),
  set: vi.fn(),
  token: vi.fn(),
  get: vi.fn(),
  updates: [] as unknown[][],
}));
vi.mock('@/lib/connectors/google-calendar/access-token', () => ({
  loadFreshGoogleAccessToken: m.token,
}));
vi.mock('@/lib/connectors/youtube/provider', () => ({
  createYouTubeSnippetWriter: () => ({ getVideo: m.get }),
}));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => {
      const q = {
        from: () => q,
        innerJoin: () => q,
        leftJoin: () => q,
        where: (condition: unknown) => {
          m.where(condition);
          return q;
        },
        limit: async () => m.rows.shift() ?? [],
      };
      return q;
    },
    insert: () => ({
      values: m.insert.mockReturnValue({
        onConflictDoNothing: async () => undefined,
      }),
    }),
    update: () => ({
      set: m.set.mockReturnValue({
        where: () => ({
          returning: async () => m.updates.shift() ?? [],
          then: (resolve: (value: unknown[]) => void) => resolve([]),
        }),
      }),
    }),
  },
}));
const row = {
  video: {
    videoId: 'video',
    channelId: 'owned',
    url: 'https://youtube.com/watch?v=video',
    description: 'Credits',
  },
  handle: 'artist',
  releaseSlug: null,
  accountId: 'account',
  scopes: [YOUTUBE_LINK_WRITE_SCOPE],
};
beforeEach(() => {
  vi.clearAllMocks();
  m.rows = [[row]];
  m.updates = [];
  m.token.mockResolvedValue('token');
  m.get.mockResolvedValue({
    id: 'video',
    etag: 'v1',
    snippet: { channelId: 'owned', description: 'Credits' },
  });
});
it('scopes imported videos to the exact profile and resolves the destination on the server', async () => {
  const context = await loadYouTubeLinkContext('artist', 'profile', 'video');
  expect(context?.expectedUrl).toMatch(/\/artist$/);
  const params = new PgDialect().sqlToQuery(m.where.mock.calls[0][0]).params;
  expect(params).toEqual(['profile', 'video']);
  expect(await loadYouTubeLinkContext('artist', 'other', 'video')).toBeNull();
});
it('inspects all statuses and offers approval only for actionable owned versions', async () => {
  const context = (await loadYouTubeLinkContext('artist', 'profile', 'video'))!;
  for (const [description, status] of [
    ['Credits', 'missing'],
    [context.expectedUrl, 'verified'],
    ['https://jov.ie/old', 'stale'],
    ['https://jov.ie/app', 'unknown'],
  ]) {
    m.get.mockResolvedValue({
      id: 'video',
      etag: 'v1',
      snippet: { channelId: 'owned', description },
    });
    const result = await previewYouTubeLink(context);
    expect(result.plan.status).toBe(status);
    expect(Boolean(result.approval)).toBe(
      status === 'missing' || status === 'stale'
    );
  }
  m.get.mockResolvedValue({ id: 'video', snippet: { channelId: 'foreign' } });
  expect(
    await (await loadYouTubeLinkWriter(context))!.getVideo('video')
  ).toBeNull();
  expect(
    await previewYouTubeLink({ ...context, accountId: null })
  ).toMatchObject({ plan: { status: 'unknown' }, approval: null });
  expect(await previewYouTubeLink({ ...context, scopes: [] })).toMatchObject({
    approval: null,
  });
});
it('fences durable saves, fails closed on a lost lease, and refuses a concurrent writer', async () => {
  m.rows = [[{ cursor: null }]];
  m.updates = [[{ id: 'lease' }], []];
  await expect(
    withYouTubeLinkStore('account', 'video', async store => {
      expect(await store.load('video')).toBeNull();
      await store.save({ videoId: 'video' } as never);
    })
  ).rejects.toBeInstanceOf(YouTubeLinkBusyError);
  expect(m.insert).toHaveBeenCalledWith({
    connectorAccountId: 'account',
    resourceKind: 'youtube_link_apply:video',
  });
  expect(m.set).toHaveBeenLastCalledWith({ tokenRefreshLockedUntil: null });
  const run = vi.fn();
  await expect(
    withYouTubeLinkStore('account', 'video', run)
  ).rejects.toBeInstanceOf(YouTubeLinkBusyError);
  expect(run).not.toHaveBeenCalled();
});
