import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getCurrentUserEntitlements: vi.fn(),
  applyModerationTakedown: vi.fn(),
  listAbuseReports: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: hoisted.getCurrentUserEntitlements,
}));

vi.mock('@/lib/admin/moderation', () => ({
  applyModerationTakedown: hoisted.applyModerationTakedown,
  listAbuseReports: hoisted.listAbuseReports,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureError,
}));

import { GET, POST } from '@/app/api/admin/moderation/route';

const URL_ = 'http://localhost/api/admin/moderation';
const get = (q = '') => new Request(`${URL_}${q}`);
const post = (body: unknown) =>
  new Request(URL_, { method: 'POST', body: JSON.stringify(body) });

const admin = { isAuthenticated: true, isAdmin: true, userId: 'admin-1' };
const anon = { isAuthenticated: false };
const nonAdmin = { isAuthenticated: true, isAdmin: false, userId: 'u1' };

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.getCurrentUserEntitlements.mockResolvedValue(admin);
  hoisted.listAbuseReports.mockResolvedValue([{ id: 'r1' }]);
  hoisted.applyModerationTakedown.mockResolvedValue({ ok: true });
});

describe('GET', () => {
  it('rejects anonymous and non-admin callers', async () => {
    hoisted.getCurrentUserEntitlements.mockResolvedValueOnce(anon);
    expect((await GET(get())).status).toBe(401);

    hoisted.getCurrentUserEntitlements.mockResolvedValueOnce(nonAdmin);
    const res = await GET(get());
    expect(res.status).toBe(403);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(hoisted.listAbuseReports).not.toHaveBeenCalled();
  });

  it('lists reports for admins and clamps the limit', async () => {
    const res = await GET(get('?limit=999'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reports: [{ id: 'r1' }] });
    expect(hoisted.listAbuseReports).toHaveBeenCalledWith(200);
  });

  it('returns 500 when the queue read fails', async () => {
    hoisted.listAbuseReports.mockRejectedValue(new Error('db down'));
    expect((await GET(get())).status).toBe(500);
    expect(hoisted.captureError).toHaveBeenCalled();
  });
});

describe('POST', () => {
  it('rejects anonymous and non-admin callers', async () => {
    hoisted.getCurrentUserEntitlements.mockResolvedValueOnce(anon);
    expect((await POST(post({}))).status).toBe(401);

    hoisted.getCurrentUserEntitlements.mockResolvedValueOnce(nonAdmin);
    expect((await POST(post({}))).status).toBe(403);
  });

  it('rejects invalid bodies and malformed JSON', async () => {
    const res = await POST(post({ targetType: 'nope', target: 'x' }));
    expect(res.status).toBe(400);
    expect(
      (await POST(new Request(URL_, { method: 'POST', body: '{bad' }))).status
    ).toBe(400);
    expect(hoisted.applyModerationTakedown).not.toHaveBeenCalled();
  });

  it('applies a takedown for a valid admin request', async () => {
    const res = await POST(
      post({
        targetType: 'profile',
        target: 'badhandle',
        reportId: '11111111-1111-4111-8111-111111111111',
        reason: 'impersonation',
      })
    );

    expect(res.status).toBe(200);
    expect(hoisted.applyModerationTakedown).toHaveBeenCalledWith({
      adminUserId: 'admin-1',
      targetType: 'profile',
      target: 'badhandle',
      reportId: '11111111-1111-4111-8111-111111111111',
      reason: 'impersonation',
    });
    expect((await res.json()).ok).toBe(true);
  });

  it('returns 500 when the takedown throws', async () => {
    hoisted.applyModerationTakedown.mockRejectedValue(new Error('db down'));
    const res = await POST(post({ targetType: 'wrapped_link', target: 'abc' }));
    expect(res.status).toBe(500);
    expect(hoisted.captureError).toHaveBeenCalled();
  });
});
