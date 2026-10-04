import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ingest = vi.hoisted(() => vi.fn());

vi.mock('@/lib/env-server', () => ({
  env: { RELEASE_COMMUNICATIONS_WEBHOOK_SECRET: 'release-secret' },
}));
vi.mock('@/lib/release-communications/drizzle-adapter', () => ({
  DrizzleReleaseCommunicationsAdapter: class {
    ingest = ingest;
  },
}));
vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: vi.fn(),
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { POST } from './route';

const SECRET = 'release-secret';
const BODY = {
  repository: 'JovieInc/Jovie',
  pullRequestNumber: 200,
  mergeSha: 'deadbeef',
  mergedAt: '2026-10-02T12:00:00Z',
  app: 'web',
  product: 'jovie',
  title: 'Daily changelog delivery',
  verified: true,
};

function request(body: unknown, signed = true) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const signature = signed
    ? `sha256=${createHmac('sha256', SECRET).update(raw).digest('hex')}`
    : 'sha256=bad';
  return new Request(
    'https://jov.ie/api/internal/release-communications/merge-events',
    {
      method: 'POST',
      headers: { 'x-jovie-signature-256': signature },
      body: raw,
    }
  ) as never;
}

describe('POST /api/internal/release-communications/merge-events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ingest.mockResolvedValue({
      id: 'post-1',
      localDate: '2026-10-02',
      entries: [{ material: true }, { material: false }],
    });
  });

  it('rejects unsigned or wrongly signed events without ingesting', async () => {
    expect((await POST(request(BODY, false))).status).toBe(401);
    const unsigned = new Request(
      'https://jov.ie/api/internal/release-communications/merge-events',
      { method: 'POST', body: JSON.stringify(BODY) }
    ) as never;
    expect((await POST(unsigned)).status).toBe(401);
    expect(ingest).not.toHaveBeenCalled();
  });

  it('rejects unverified payloads', async () => {
    const res = await POST(request({ ...BODY, verified: false }));
    expect(res.status).toBe(422);
    expect(ingest).not.toHaveBeenCalled();
  });

  it('rejects events from unregistered repositories', async () => {
    const res = await POST(
      request({ ...BODY, repository: 'JovieInc/unknown' })
    );
    expect(res.status).toBe(422);
    expect(ingest).not.toHaveBeenCalled();
  });

  it('ingests a signed verified merge event', async () => {
    const res = await POST(request(BODY));
    expect(res.status).toBe(200);
    expect(ingest).toHaveBeenCalledWith(
      expect.objectContaining({
        repository: 'JovieInc/Jovie',
        pullRequestNumber: 200,
        mergeSha: 'deadbeef',
        verified: true,
      })
    );
    const json = await res.json();
    expect(json).toMatchObject({
      postId: 'post-1',
      localDate: '2026-10-02',
      entryCount: 2,
      materialCount: 1,
    });
  });
});
