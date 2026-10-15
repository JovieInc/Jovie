import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { LibraryRelationshipWriteError } from '@/lib/library/track-drawer.server';
import { DELETE, POST } from './route';

const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  tag: vi.fn(),
  untag: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/lib/library/track-drawer.server', () => ({
  requireLibraryProfileAccess: mocks.requireAccess,
  tagMerchInYouTubeVideo: mocks.tag,
  untagMerchInYouTubeVideo: mocks.untag,
  LibraryRelationshipWriteError: class extends Error {
    constructor(
      readonly code: 'not_found' | 'conflict',
      message: string
    ) {
      super(message);
    }
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mocks.captureError,
}));

const identifiers = {
  creatorProfileId: '11111111-1111-4111-8111-111111111111',
  videoId: 'video + /?&=雪',
  merchCardId: '22222222-2222-4222-8222-222222222222',
};

function deleteRequest(params = new URLSearchParams(identifiers)) {
  return new Request(
    `https://example.com/api/library/relationships?${params}`,
    {
      method: 'DELETE',
    }
  );
}

describe('/api/library/relationships', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireAccess.mockResolvedValue({ userId: 'user-1' });
    mocks.untag.mockResolvedValue(undefined);
  });

  it('removes a tag using query identifiers without reading a request body', async () => {
    const request = deleteRequest();
    const readBody = vi.spyOn(request, 'json');

    const response = await DELETE(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(response.headers.get('cache-control')).toBe(
      NO_STORE_HEADERS['Cache-Control']
    );
    expect(readBody).not.toHaveBeenCalled();
    expect(mocks.requireAccess).toHaveBeenCalledWith(
      identifiers.creatorProfileId
    );
    expect(mocks.untag).toHaveBeenCalledExactlyOnceWith(identifiers);
    expect(mocks.tag).not.toHaveBeenCalled();
  });

  it.each(['creatorProfileId', 'videoId', 'merchCardId'])(
    'rejects a missing or empty %s before authorization or mutation',
    async key => {
      for (const value of [null, '']) {
        const params = new URLSearchParams(identifiers);
        if (value === null) params.delete(key);
        else params.set(key, value);

        const response = await DELETE(deleteRequest(params));

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({
          error: 'Invalid payload',
        });
      }
      expect(mocks.requireAccess).not.toHaveBeenCalled();
      expect(mocks.untag).not.toHaveBeenCalled();
    }
  );

  it.each(['creatorProfileId', 'merchCardId'])(
    'rejects an invalid %s UUID',
    async key => {
      const params = new URLSearchParams(identifiers);
      params.set(key, 'invalid');

      expect((await DELETE(deleteRequest(params))).status).toBe(400);
      expect(mocks.requireAccess).not.toHaveBeenCalled();
      expect(mocks.untag).not.toHaveBeenCalled();
    }
  );

  it('rejects body-only DELETE identifiers', async () => {
    const response = await DELETE(
      new Request('https://example.com/api/library/relationships', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(identifiers),
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.untag).not.toHaveBeenCalled();
  });

  it.each([401, 403])(
    'does not mutate when access returns %s',
    async status => {
      mocks.requireAccess.mockResolvedValue({
        error: NextResponse.json({ error: 'Access denied' }, { status }),
      });

      const response = await DELETE(deleteRequest());

      expect(response.status).toBe(status);
      expect(mocks.untag).not.toHaveBeenCalled();
    }
  );

  it('returns a conflict when a tag cannot be removed', async () => {
    mocks.untag.mockRejectedValue(
      new LibraryRelationshipWriteError('conflict', 'Tag is locked')
    );

    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: 'Tag is locked' });
    expect(mocks.captureError).not.toHaveBeenCalled();
  });

  it('reports an unexpected deletion failure without claiming success', async () => {
    const error = new Error('Database unavailable');
    mocks.untag.mockRejectedValue(error);

    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Internal error' });
    expect(mocks.captureError).toHaveBeenCalledWith(
      'Library relationship DELETE failed',
      error,
      { route: '/api/library/relationships', method: 'DELETE' }
    );
  });

  it('still creates tags from a POST JSON body', async () => {
    const relationship = { id: 'relationship-1' };
    mocks.tag.mockResolvedValue(relationship);

    const response = await POST(
      new Request('https://example.com/api/library/relationships', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(identifiers),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ relationship });
    expect(mocks.tag).toHaveBeenCalledExactlyOnceWith(identifiers);
    expect(mocks.requireAccess).toHaveBeenCalledWith(
      identifiers.creatorProfileId
    );
  });

  it('rejects malformed POST JSON before mutation', async () => {
    const response = await POST(
      new Request('https://example.com/api/library/relationships', {
        method: 'POST',
        body: '{',
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.requireAccess).not.toHaveBeenCalled();
    expect(mocks.tag).not.toHaveBeenCalled();
  });
});
