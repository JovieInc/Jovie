// @vitest-environment node
import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PIPELINE_BOTTLENECK_PATH,
  PIPELINE_CONTRIBUTION_PATH,
} from '@/lib/ovie/pipeline-bottleneck';
import {
  bottleneckFixture,
  contributionFixture,
} from '@/lib/ovie/pipeline-bottleneck.fixtures';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  get: vi.fn(),
  configured: vi.fn(),
}));
vi.mock('@/lib/admin/middleware', () => ({ requireAdmin: mocks.admin }));
vi.mock('@vercel/blob', () => ({ get: mocks.get, put: vi.fn() }));
vi.mock('@/lib/blob-config', () => ({
  isBlobStorageConfigured: mocks.configured,
  getBlobCommandOptions: () => ({}),
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

function blob(value: unknown) {
  return { statusCode: 200, stream: new Response(JSON.stringify(value)).body };
}

describe('GET pipeline bottleneck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.admin.mockResolvedValue(null);
    mocks.configured.mockReturnValue(true);
    mocks.get.mockImplementation(async (path: string) =>
      blob(
        path === PIPELINE_BOTTLENECK_PATH
          ? bottleneckFixture()
          : contributionFixture()
      )
    );
  });

  it.each([401, 403, 423])(
    'denies auth/privacy failures (%i) before reading Blob',
    async status => {
      mocks.admin.mockResolvedValue(
        NextResponse.json({ error: 'Denied' }, { status })
      );
      const response = await GET();
      expect(response.status).toBe(status);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(mocks.get).not.toHaveBeenCalled();
    }
  );

  it('reads both exact paths and returns the uncached merged contract', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      status: 'needs-you',
      rank1: contributionFixture().rank1Override,
      metrics: contributionFixture().metrics,
    });
    for (const path of [PIPELINE_BOTTLENECK_PATH, PIPELINE_CONTRIBUTION_PATH]) {
      expect(mocks.get).toHaveBeenCalledWith(
        path,
        expect.objectContaining({
          access: 'public',
          abortSignal: expect.any(AbortSignal),
        })
      );
    }
  });

  it.each([
    null,
    {},
    bottleneckFixture({ observedAt: '2020-01-01T00:00:00Z' }),
  ])(
    'returns unknown for absent, invalid, or stale Summer input',
    async input => {
      mocks.get.mockImplementation(async (path: string) =>
        path === PIPELINE_BOTTLENECK_PATH
          ? input === null
            ? null
            : blob(input)
          : blob(contributionFixture())
      );
      expect(await (await GET()).json()).toBeNull();
    }
  );

  it.each(['not-a-url', 'javascript:alert(1)'])(
    'returns unknown for Summer input with a malformed status link (%s)',
    async statusLink => {
      mocks.get.mockImplementation(async (path: string) =>
        path === PIPELINE_BOTTLENECK_PATH
          ? blob(bottleneckFixture({ statusLink }))
          : blob(contributionFixture())
      );
      expect(await (await GET()).json()).toBeNull();
    }
  );

  it('retains Summer when the optional loop Blob fails', async () => {
    mocks.get.mockImplementation(async (path: string) => {
      if (path === PIPELINE_CONTRIBUTION_PATH) throw new Error('Unavailable');
      return blob(bottleneckFixture());
    });
    expect(await (await GET()).json()).toMatchObject({
      status: 'agentic',
      metrics: {},
    });
  });

  it('returns unknown without storage configuration', async () => {
    mocks.configured.mockReturnValue(false);
    expect(await (await GET()).json()).toBeNull();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('fails closed on storage or auth-helper exceptions', async () => {
    mocks.get.mockRejectedValue(new Error('Unavailable'));
    expect((await GET()).status).toBe(503);
    mocks.admin.mockRejectedValue(new Error('Auth unavailable'));
    expect((await GET()).status).toBe(503);
  });
});
