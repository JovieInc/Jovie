import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: { select: mocks.select, update: mocks.update },
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.captureError }));

import { POST } from '@/app/api/investors/track/route';

const CLAIM_TOKEN = 'a'.repeat(43);

function request(body: unknown) {
  return new Request('https://jov.ie/api/investors/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function limitResult(rows: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        limit: vi.fn().mockResolvedValue(rows),
        orderBy: () => ({
          limit: vi.fn().mockResolvedValue(rows),
        }),
      }),
    }),
  };
}

describe('POST /api/investors/track', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a missing or short claim token before reading the database', async () => {
    const missing = await POST(
      request({ pagePath: '/investor-portal', durationHintMs: 10 })
    );
    expect(missing.status).toBe(400);

    const short = await POST(
      request({
        token: 'token-123',
        pagePath: '/investor-portal',
        durationHintMs: 10,
      })
    );
    expect(short.status).toBe(404);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('rejects a link with no future expiry', async () => {
    mocks.select.mockReturnValueOnce(
      limitResult([{ id: 'link-1', expiresAt: null }])
    );

    const response = await POST(
      request({
        token: CLAIM_TOKEN,
        pagePath: '/investor-portal',
        durationHintMs: 10,
      })
    );

    expect(response.status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('records duration only for an unexpired claim link', async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    mocks.select
      .mockReturnValueOnce(
        limitResult([
          { id: 'link-1', expiresAt: new Date('2099-01-01T00:00:00.000Z') },
        ])
      )
      .mockReturnValueOnce(limitResult([{ id: 'view-1' }]));
    mocks.update.mockReturnValue({ set: () => ({ where }) });

    const response = await POST(
      request({
        token: CLAIM_TOKEN,
        pagePath: '/investor-portal',
        durationHintMs: 1500,
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(where).toHaveBeenCalled();
  });
});
