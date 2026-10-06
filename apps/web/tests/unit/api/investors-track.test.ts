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

function selectRowsOnce(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn(() => ({ limit }));
  const where = vi.fn(() => ({ limit, orderBy }));
  const from = vi.fn(() => ({ where }));
  mocks.select.mockReturnValueOnce({ from });
}

describe('investor track route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects tokens without the claim shape before querying', async () => {
    const response = await POST(
      request({ token: 'short', pagePath: '/x', durationHintMs: 1 })
    );

    expect(response.status).toBe(404);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('rejects missing, expired, and never-expiring links', async () => {
    selectRowsOnce([]);
    expect(
      (
        await POST(
          request({
            token: CLAIM_TOKEN,
            pagePath: '/x',
            durationHintMs: 1,
          })
        )
      ).status
    ).toBe(404);

    selectRowsOnce([
      { id: 'link-1', expiresAt: new Date('2020-01-01T00:00:00.000Z') },
    ]);
    expect(
      (
        await POST(
          request({
            token: CLAIM_TOKEN,
            pagePath: '/x',
            durationHintMs: 1,
          })
        )
      ).status
    ).toBe(404);

    selectRowsOnce([{ id: 'link-1', expiresAt: null }]);
    expect(
      (
        await POST(
          request({
            token: CLAIM_TOKEN,
            pagePath: '/x',
            durationHintMs: 1,
          })
        )
      ).status
    ).toBe(404);
  });

  it('updates the duration hint on an unexpired link', async () => {
    selectRowsOnce([
      { id: 'link-1', expiresAt: new Date('2099-01-01T00:00:00.000Z') },
    ]);
    selectRowsOnce([{ id: 'view-1' }]);
    const where = vi.fn().mockResolvedValue(undefined);
    mocks.update.mockReturnValue({
      set: vi.fn(() => ({ where })),
    });

    const response = await POST(
      request({ token: CLAIM_TOKEN, pagePath: '/x', durationHintMs: 1200 })
    );

    expect(response.status).toBe(200);
    expect(where).toHaveBeenCalledOnce();
  });
});
