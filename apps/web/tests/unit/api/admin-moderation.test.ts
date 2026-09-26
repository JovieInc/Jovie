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

const admin = {
  isAuthenticated: true,
  isAdmin: true,
  userId: 'admin-1',
};

const URL_ = 'http://localhost/api/admin/moderation';
const get = (q = '') => new Request(`${URL_}${q}`);
const postRequest = (body: unknown) =>
  new Request(URL_, { method: 'POST', body: JSON.stringify(body) });

describe('GET /api/admin/moderation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getCurrentUserEntitlements.mockResolvedValue(admin);
    hoisted.listAbuseReports.mockResolvedValue([{ id: 'r1' }]);
  });

  it('returns 401 when unauthenticated', async () => {
    hoisted.getCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: false,
    });
    const res = await GET(get());
    expect(res.status).toBe(401);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns 403 for non-admin users', async () => {
    hoisted.getCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: false,
      userId: 'u1',
    });
    const res = await GET(get());
    expect(res.status).toBe(403);
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
    const res = await GET(get());
    expect(res.status).toBe(500);
    expect(hoisted.captureError).toHaveBeenCalled();
  });
});

describe('POST /api/admin/moderation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getCurrentUserEntitlements.mockResolvedValue(admin);
    hoisted.applyModerationTakedown.mockResolvedValue({
      ok: true,
      profileId: 'prof-1',
      wrappedLinksDisabled: 1,
      reportsResolved: 1,
    });
  });

  it('returns 401 when unauthenticated', async () => {
    hoisted.getCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: false,
    });
    const res = await POST(postRequest({}));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin users', async () => {
    hoisted.getCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: false,
      userId: 'u1',
    });
    const res = await POST(postRequest({}));
    expect(res.status).toBe(403);
  });

  it('rejects invalid bodies', async () => {
    const res = await POST(postRequest({ targetType: 'nope', target: 'x' }));
    expect(res.status).toBe(400);
    expect(hoisted.applyModerationTakedown).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON', async () => {
    const res = await POST(new Request(URL_, { method: 'POST', body: '{bad' }));
    expect(res.status).toBe(400);
  });

  it('applies a takedown for a valid admin request', async () => {
    const res = await POST(
      postRequest({
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
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it('returns 500 when the takedown throws', async () => {
    hoisted.applyModerationTakedown.mockRejectedValue(new Error('db down'));
    const res = await POST(
      postRequest({ targetType: 'wrapped_link', target: 'abc123' })
    );
    expect(res.status).toBe(500);
    expect(hoisted.captureError).toHaveBeenCalled();
  });
});
