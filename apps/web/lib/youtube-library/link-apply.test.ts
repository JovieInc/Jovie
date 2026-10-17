import { describe, expect, it, vi } from 'vitest';
import {
  applyYouTubeLink,
  approvalFromPlan,
  createMemoryYouTubeLinkStore,
  rollbackYouTubeLink,
  sourceVersionFor,
  YOUTUBE_LINK_WRITE_SCOPE,
  type YouTubeSnippetWriter,
  type YouTubeVideoSnippetRecord,
} from './link-apply';
import { inspectYouTubeLink } from './link-inspect';

function fixture() {
  let live: YouTubeVideoSnippetRecord = {
    id: 'video',
    etag: 'v1',
    snippet: {
      title: 'Title',
      description: 'Credits',
      categoryId: '10',
    },
  };
  const store = createMemoryYouTubeLinkStore();
  const writer: YouTubeSnippetWriter = {
    getVideo: vi.fn(async () => live),
    updateVideo: vi.fn(async update => {
      expect(await store.load('video')).toMatchObject({
        originalDescription: 'Credits',
        approvedBy: 'artist',
      });
      if (update.etag !== live.etag) throw { status: 412 };
      live = {
        ...live,
        etag: `v${Number(live.etag?.slice(1)) + 1}`,
        snippet: update.snippet,
      };
      return live;
    }),
  };
  const expectedUrl = 'https://jov.ie/artist';
  const plan = inspectYouTubeLink({
    description: live.snippet.description,
    expectedUrl,
    videoUrl: 'https://youtube.com/watch?v=video',
  });
  const approval = approvalFromPlan({
    videoId: 'video',
    plan,
    sourceVersion: sourceVersionFor(live.snippet.description, live.etag),
  });
  const input = {
    videoId: 'video',
    videoUrl: 'https://youtube.com/watch?v=video',
    expectedUrl,
    approval,
    approvedBy: 'artist',
    auth: { state: 'ok' as const, scopes: [YOUTUBE_LINK_WRITE_SCOPE] },
    store,
    writer,
  };
  return {
    input,
    writer,
    store,
    current: () => live,
    edit: (description: string) => {
      live = {
        ...live,
        etag: 'external',
        snippet: { ...live.snippet, description },
      };
    },
  };
}

describe('approved YouTube description writes', () => {
  it('journals approval and original before a write, verifies, and preserves original on retry', async () => {
    const f = fixture();
    expect(await applyYouTubeLink(f.input)).toMatchObject({
      ok: true,
      status: 'verified',
    });
    const first = await f.store.load('video');
    expect(first?.approval).toEqual(f.input.approval);
    expect(first?.approvedAt).toEqual(expect.any(String));
    expect(await applyYouTubeLink(f.input)).toMatchObject({ ok: true });
    expect(f.writer.updateVideo).toHaveBeenCalledTimes(1);
    expect(await f.store.load('video')).toEqual(first);
  });

  it('rejects an approval when the ETag changes but the description stays the same', async () => {
    const f = fixture();
    f.edit(f.current().snippet.description);
    expect(await applyYouTubeLink(f.input)).toMatchObject({
      error: 'stale-approval',
    });
    expect(f.writer.updateVideo).not.toHaveBeenCalled();
  });

  it('does not write if recording the original fails', async () => {
    const f = fixture();
    await expect(
      applyYouTubeLink({
        ...f.input,
        store: {
          ...f.store,
          save: async () => {
            throw new Error('db unavailable');
          },
        },
      })
    ).rejects.toThrow('db unavailable');
    expect(f.writer.updateVideo).not.toHaveBeenCalled();
  });

  it('does not roll back a concurrent edit or a rejected conditional write', async () => {
    const f = fixture();
    vi.mocked(f.writer.updateVideo).mockImplementationOnce(async () => {
      f.edit('Artist edited this');
      throw { status: 412 };
    });
    expect(await applyYouTubeLink(f.input)).toMatchObject({
      error: 'rollback-conflict',
    });
    expect(f.current().snippet.description).toBe('Artist edited this');
    expect(f.writer.updateVideo).toHaveBeenCalledTimes(1);
  });

  it('restores our own write after a transient failed readback', async () => {
    const f = fixture();
    vi.mocked(f.writer.getVideo)
      .mockImplementationOnce(async () => f.current())
      .mockRejectedValueOnce(new Error('readback timed out'));
    expect(await applyYouTubeLink(f.input)).toMatchObject({
      error: 'readback-mismatch',
    });
    expect(f.current().snippet.description).toBe('Credits');
    expect(f.writer.updateVideo).toHaveBeenCalledTimes(2);
  });

  it('leaves later artist edits untouched on manual restore', async () => {
    const f = fixture();
    await applyYouTubeLink(f.input);
    const operation = await f.store.load('video');
    const sourceVersion = sourceVersionFor(
      f.current().snippet.description,
      f.current().etag
    );
    f.edit('Keep this newer description');
    expect(
      await rollbackYouTubeLink({
        videoId: 'video',
        operationKey: operation!.idempotencyKey,
        sourceVersion,
        approvedBy: 'artist',
        writer: f.writer,
        store: f.store,
      })
    ).toMatchObject({ error: 'rollback-conflict' });
    expect(f.writer.updateVideo).toHaveBeenCalledTimes(1);
  });
});
