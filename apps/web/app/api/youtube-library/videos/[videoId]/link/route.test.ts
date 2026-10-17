import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { YouTubeVideoSnippetRecord } from '@/lib/youtube-library/link-apply';
import {
  approvalFromPlan,
  createMemoryYouTubeLinkStore,
  sourceVersionFor,
  YOUTUBE_LINK_WRITE_SCOPE,
} from '@/lib/youtube-library/link-apply';
import { inspectYouTubeLink } from '@/lib/youtube-library/link-inspect';
import { GET, POST } from './route';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  context: vi.fn(),
  preview: vi.fn(),
  writer: vi.fn(),
  store: vi.fn(),
  capture: vi.fn(),
}));
vi.mock('@/lib/library/track-drawer.server', () => ({
  requireLibraryProfileAccess: mocks.access,
}));
vi.mock('@/lib/youtube-library/link-service', () => ({
  loadYouTubeLinkContext: mocks.context,
  previewYouTubeLink: mocks.preview,
  loadYouTubeLinkWriter: mocks.writer,
}));
vi.mock('@/lib/youtube-library/link-store', () => ({
  withYouTubeLinkStore: mocks.store,
  YouTubeLinkBusyError: class extends Error {},
}));
vi.mock('@/lib/connectors/token-vault', () => ({
  RefreshLockBusyError: class extends Error {},
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.capture }));

const profile = '22222222-2222-4222-8222-222222222222';
const params = { params: Promise.resolve({ videoId: 'video' }) };
const url = `https://app.jov.ie/api/youtube-library/videos/video/link?creatorProfileId=${profile}`;
const command = (body: unknown) =>
  new Request(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
const approval = {
  approved: true,
  scope: 'single-item-description-link',
  videoId: 'video',
  sourceVersion: { etag: 'v1', descriptionSha256: 'a'.repeat(64) },
  proposedDescriptionSha256: 'b'.repeat(64),
  expectedUrl: 'https://jov.ie/artist',
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({ userId: 'artist' });
  mocks.context.mockResolvedValue({
    accountId: 'account',
    expectedUrl: 'https://jov.ie/artist',
    scopes: [YOUTUBE_LINK_WRITE_SCOPE],
    video: { videoId: 'video', url: 'https://youtube.com/watch?v=video' },
  });
});

describe('Library YouTube link route', () => {
  it('defaults to private inspection without creating any write operation', async () => {
    mocks.preview.mockResolvedValue({ plan: { status: 'missing' } });
    const response = await GET(new Request(url), params);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toMatchObject({
      plan: { status: 'missing' },
    });
    expect(mocks.context).toHaveBeenCalledWith('artist', profile, 'video');
    expect(mocks.store).not.toHaveBeenCalled();
  });

  it('rejects anonymous, cross-profile and unimported requests', async () => {
    for (const status of [401, 403]) {
      mocks.access.mockResolvedValueOnce({
        error: NextResponse.json({ error: 'Denied' }, { status }),
      });
      expect((await GET(new Request(url), params)).status).toBe(status);
    }
    expect(mocks.context).not.toHaveBeenCalled();
    mocks.context.mockResolvedValueOnce(null);
    expect((await GET(new Request(url), params)).status).toBe(404);
  });

  it('rejects invalid payloads and missing explicit approval before touching YouTube', async () => {
    for (const body of [
      { creatorProfileId: profile },
      {
        action: 'apply',
        creatorProfileId: profile,
        approval: { ...approval, approved: false },
      },
    ]) {
      expect((await POST(command(body), params)).status).toBe(400);
    }
    expect(mocks.writer).not.toHaveBeenCalled();
    expect(
      (await POST(new Request(url, { method: 'POST', body: '{' }), params))
        .status
    ).toBe(400);
  });

  it('requires a connected write grant and a fresh token', async () => {
    mocks.context.mockResolvedValueOnce({ accountId: null, scopes: [] });
    expect(
      (
        await POST(
          command({ action: 'apply', creatorProfileId: profile, approval }),
          params
        )
      ).status
    ).toBe(409);
    mocks.writer.mockResolvedValueOnce(null);
    expect(
      (
        await POST(
          command({ action: 'apply', creatorProfileId: profile, approval }),
          params
        )
      ).status
    ).toBe(409);
    expect(mocks.store).not.toHaveBeenCalled();
  });

  it('records approval, applies, verifies and restores through the single-video store', async () => {
    let live: YouTubeVideoSnippetRecord = {
      id: 'video',
      etag: 'v1',
      snippet: { title: 'Title', description: 'Credits', categoryId: '10' },
    };
    const store = createMemoryYouTubeLinkStore();
    mocks.writer.mockResolvedValue({
      getVideo: async () => live,
      updateVideo: async (update: {
        snippet: YouTubeVideoSnippetRecord['snippet'];
      }) => {
        live = { ...live, etag: 'v2', snippet: update.snippet };
        return live;
      },
    });
    mocks.store.mockImplementation(async (_account, _video, run) => run(store));
    const approved = approvalFromPlan({
      videoId: 'video',
      sourceVersion: sourceVersionFor('Credits', 'v1'),
      plan: inspectYouTubeLink({
        description: 'Credits',
        expectedUrl: 'https://jov.ie/artist',
        videoUrl: 'https://youtube.com/watch?v=video',
      }),
    });
    expect(
      (
        await POST(
          command({
            action: 'apply',
            creatorProfileId: profile,
            approval: approved,
          }),
          params
        )
      ).status
    ).toBe(200);
    const op = await store.load('video');
    expect(op).toMatchObject({
      status: 'verified',
      originalDescription: 'Credits',
      approvedBy: 'artist',
    });
    expect(
      (
        await POST(
          command({
            action: 'rollback',
            creatorProfileId: profile,
            approved: true,
            operationKey: op!.idempotencyKey,
            sourceVersion: sourceVersionFor(
              live.snippet.description,
              live.etag
            ),
          }),
          params
        )
      ).status
    ).toBe(200);
    expect(live.snippet.description).toBe('Credits');
    expect(await store.load('video')).toMatchObject({
      status: 'rolled-back',
      rollbackApproval: { approvedBy: 'artist' },
    });
    expect(mocks.store.mock.calls[0].slice(0, 2)).toEqual(['account', 'video']);
  });
});
