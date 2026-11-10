// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PIPELINE_CONTRIBUTION_PATH } from '@/lib/ovie/pipeline-bottleneck';
import { contributionFixture } from '@/lib/ovie/pipeline-bottleneck.fixtures';
import { POST } from './route';

const mocks = vi.hoisted(() => ({ put: vi.fn(), configured: vi.fn() }));
vi.mock('@vercel/blob', () => ({ get: vi.fn(), put: mocks.put }));
vi.mock('@/lib/blob-config', () => ({
  isBlobStorageConfigured: mocks.configured,
  getBlobCommandOptions: () => ({}),
}));
vi.mock('@/lib/env-server', () => ({
  env: { CRON_SECRET: 'test-cron-secret', NODE_ENV: 'test' },
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

function request(
  body: unknown = contributionFixture(),
  bearer = 'test-cron-secret'
) {
  return new Request(
    'https://jov.ie/api/internal/ovie/pipeline-bottleneck/contributions',
    {
      method: 'POST',
      headers: { authorization: `Bearer ${bearer}` },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }
  );
}

describe('POST pipeline bottleneck contribution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.configured.mockReturnValue(true);
    mocks.put.mockResolvedValue({
      url: 'https://example.public.blob.vercel-storage.com/contribution.json',
    });
  });

  it.each(['', 'wrong-secret'])(
    'requires a valid cron bearer before reading or writing',
    async bearer => {
      const response = await POST(request('invalid json', bearer));
      expect(response.status).toBe(401);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(mocks.put).not.toHaveBeenCalled();
    }
  );

  it.each([
    '{',
    {},
    { ...contributionFixture(), schema: 'wrong' },
    { ...contributionFixture(), cost: { item: 'Memory', monthlyUsd: -1 } },
  ])('rejects malformed JSON or invalid contributions', async body => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it('caps actual UTF-8 bytes even without a content-length header', async () => {
    const response = await POST(
      request(
        JSON.stringify({ ...contributionFixture(), impact: 'é'.repeat(8200) })
      )
    );
    expect(response.status).toBe(413);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it('rejects an oversized declared length before parsing', async () => {
    const input = request();
    input.headers.set('content-length', '16385');
    expect((await POST(input)).status).toBe(413);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it('overwrites only the hourly-loop path after validation', async () => {
    const input = contributionFixture();
    const response = await POST(request(input));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.put).toHaveBeenCalledWith(
      PIPELINE_CONTRIBUTION_PATH,
      expect.any(String),
      expect.objectContaining({
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
        abortSignal: expect.any(AbortSignal),
      })
    );
    expect(JSON.parse(mocks.put.mock.calls[0][1])).toEqual(input);
  });

  it('never acknowledges a failed or unconfigured write', async () => {
    mocks.put.mockRejectedValue(new Error('Storage unavailable'));
    expect((await POST(request())).status).toBe(503);
    mocks.configured.mockReturnValue(false);
    expect((await POST(request())).status).toBe(503);
    expect(mocks.put).toHaveBeenCalledTimes(1);
  });
});
