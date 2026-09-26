import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  auth: vi.fn(),
  takedown: vi.fn(),
  list: vi.fn(),
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: hoisted.auth,
}));
vi.mock('@/lib/admin/moderation', () => ({
  applyModerationTakedown: hoisted.takedown,
  listAbuseReports: hoisted.list,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

import { GET, POST } from '@/app/api/admin/moderation/route';

const URL_ = 'http://localhost/api/admin/moderation';
const post = (body: unknown) =>
  new Request(URL_, { method: 'POST', body: JSON.stringify(body) });
const admin = { isAuthenticated: true, isAdmin: true, userId: 'admin-1' };

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.auth.mockResolvedValue(admin);
  hoisted.list.mockResolvedValue([{ id: 'r1' }]);
  hoisted.takedown.mockResolvedValue({ ok: true });
});

describe('admin moderation route', () => {
  it('rejects anonymous and non-admin callers (GET and POST)', async () => {
    hoisted.auth.mockResolvedValueOnce({ isAuthenticated: false });
    expect((await GET(new Request(URL_))).status).toBe(401);
    hoisted.auth.mockResolvedValueOnce({ isAuthenticated: true });
    const res = await GET(new Request(URL_));
    expect(res.status).toBe(403);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    hoisted.auth.mockResolvedValueOnce({ isAuthenticated: false });
    expect((await POST(post({}))).status).toBe(401);
    expect(hoisted.list).not.toHaveBeenCalled();
    expect(hoisted.takedown).not.toHaveBeenCalled();
  });

  it('GET lists reports for admins and clamps the limit', async () => {
    const res = await GET(new Request(`${URL_}?limit=999`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reports: [{ id: 'r1' }] });
    expect(hoisted.list).toHaveBeenCalledWith(200);
  });

  it('GET returns 500 when the queue read fails', async () => {
    hoisted.list.mockRejectedValue(new Error('db down'));
    expect((await GET(new Request(URL_))).status).toBe(500);
  });

  it('POST validates input, applies takedown, and maps errors', async () => {
    expect((await POST(post({ targetType: 'nope', target: 'x' }))).status).toBe(
      400
    );
    expect(
      (await POST(new Request(URL_, { method: 'POST', body: '{bad' }))).status
    ).toBe(400);
    expect(hoisted.takedown).not.toHaveBeenCalled();

    const res = await POST(
      post({ targetType: 'profile', target: 'badhandle', reason: 'x' })
    );
    expect(res.status).toBe(200);
    expect(hoisted.takedown).toHaveBeenCalledWith({
      adminUserId: 'admin-1',
      targetType: 'profile',
      target: 'badhandle',
      reason: 'x',
    });

    hoisted.takedown.mockRejectedValue(new Error('db down'));
    expect(
      (await POST(post({ targetType: 'wrapped_link', target: 'a' }))).status
    ).toBe(500);
  });
});
