import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  limit: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: mocks.cookieGet })),
}));
vi.mock('@/lib/rate-limit', () => ({ apiLimiter: { limit: mocks.limit } }));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.captureError }));
vi.mock('@/lib/db', () => ({
  db: { select: mocks.select, insert: mocks.insert },
}));

import { POST } from '@/app/investor-portal/events/route';

function request(body: unknown, origin = 'https://jov.ie') {
  return new Request('https://jov.ie/investor-portal/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(body),
  });
}

function selectRows(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  mocks.select.mockReturnValue({ from });
}

describe('investor portal event route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieGet.mockReturnValue({ value: 'secret-token' });
    mocks.limit.mockResolvedValue({ success: true });
    selectRows([{ id: 'link-1', expiresAt: null }]);
    mocks.insert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('persists an allowlisted event path without returning identity', async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    mocks.insert.mockReturnValue({ values });

    const response = await POST(
      request({ event: 'deck_progressed', slideId: 'product' })
    );

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        investorLinkId: 'link-1',
        pagePath: '/investor-portal#event/deck_progressed/product',
      })
    );
    expect(JSON.stringify(values.mock.calls)).not.toContain('secret-token');
  });

  it('rejects cross-origin and non-allowlisted payloads', async () => {
    expect(
      (await POST(request({ event: 'portal_opened' }, 'https://evil.test')))
        .status
    ).toBe(403);
    expect((await POST(request({ event: 'arbitrary' }))).status).toBe(400);
    expect(
      (await POST(request({ event: 'deck_progressed', slideId: '../token' })))
        .status
    ).toBe(400);
  });

  it('rejects inactive, missing, and expired links', async () => {
    selectRows([]);
    expect((await POST(request({ event: 'portal_opened' }))).status).toBe(404);

    selectRows([{ id: 'link-1', expiresAt: new Date('2020-01-01') }]);
    expect((await POST(request({ event: 'portal_opened' }))).status).toBe(404);

    mocks.cookieGet.mockReturnValue(undefined);
    expect((await POST(request({ event: 'portal_opened' }))).status).toBe(404);
  });

  it('fails open after a persistence error without leaking details', async () => {
    mocks.insert.mockImplementation(() => {
      throw new Error('database unavailable');
    });
    const response = await POST(request({ event: 'demo_completed' }));
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(mocks.captureError).toHaveBeenCalledOnce();
  });
});
