import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  record: vi.fn(),
}));

vi.mock('@/lib/admin/middleware', () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: async () => ({ userId: 'u1', actorUserId: null }),
}));
vi.mock('@/lib/copy-jam/verdicts.server', () => ({
  recordCopyVerdict: mocks.record,
}));

import { POST } from './route';

const post = (body: unknown) =>
  POST(
    new Request('https://jov.ie/api/admin/copy-jam/verdict', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    })
  );

describe('/api/admin/copy-jam/verdict', () => {
  beforeEach(() => {
    mocks.requireAdmin.mockReset().mockResolvedValue(null);
    mocks.record.mockReset();
  });

  it('rejects non-admins before reading the body', async () => {
    mocks.requireAdmin.mockResolvedValue(
      NextResponse.json({}, { status: 403 })
    );
    expect((await post({ copyId: 'HOME-1', verdict: 'great' })).status).toBe(
      403
    );
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it('stores a tap verdict', async () => {
    mocks.record.mockResolvedValue({ copyId: 'HOME-1', verdict: 'great' });
    const res = await post({ copyId: 'HOME-1', verdict: 'great', note: 'yes' });
    expect(res.status).toBe(200);
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({
        copyId: 'HOME-1',
        verdict: 'great',
        note: 'yes',
        by: 'u1',
        source: 'ovie-tap',
      })
    );
  });

  it('400s a bad verdict and 404s an unknown line', async () => {
    expect((await post({ copyId: 'HOME-1', verdict: 'ok' })).status).toBe(400);
    mocks.record.mockResolvedValue(null);
    expect((await post({ copyId: 'ZZZ-1', verdict: 'meh' })).status).toBe(404);
  });
});
