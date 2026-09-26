import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  auth: vi.fn(),
  takedown: vi.fn(),
  list: vi.fn(),
  createFeedbackItem: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: hoisted.auth,
}));
vi.mock('@/lib/admin/moderation', () => ({
  applyModerationTakedown: hoisted.takedown,
  listAbuseReports: hoisted.list,
}));
vi.mock('@/lib/feedback', () => ({
  createFeedbackItem: hoisted.createFeedbackItem,
}));
vi.mock('@/lib/rate-limit', () => ({
  allowIfRateLimitBackendDegraded: (r: unknown) => r,
  createRateLimitHeaders: () => ({}),
  getClientIP: () => '127.0.0.1',
  publicClickLimiter: { limit: hoisted.rateLimit },
}));
vi.mock('@/lib/utils/bot-detection', () => ({
  detectBot: vi.fn().mockReturnValue({ isBot: false }),
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

import { GET, POST } from '@/app/api/admin/moderation/route';
import { POST as reportPost } from '@/app/api/report/route';

const URL_ = 'http://localhost/api/admin/moderation';
const get = (q = '') => new Request(`${URL_}${q}`);
const post = (body: unknown) =>
  new Request(URL_, { method: 'POST', body: JSON.stringify(body) });
const report = (body: unknown) =>
  new NextRequest('http://localhost/api/report', {
    method: 'POST',
    body: JSON.stringify(body),
  });
const admin = { isAuthenticated: true, isAdmin: true, userId: 'admin-1' };
const validReport = {
  targetType: 'profile',
  target: 'somehandle',
  category: 'phishing',
};

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.auth.mockResolvedValue(admin);
  hoisted.list.mockResolvedValue([{ id: 'r1' }]);
  hoisted.takedown.mockResolvedValue({ ok: true });
  hoisted.rateLimit.mockResolvedValue({ success: true });
  hoisted.createFeedbackItem.mockResolvedValue({ id: 'r1' });
});

it('admin route rejects anonymous and non-admin callers', async () => {
  hoisted.auth.mockResolvedValueOnce({ isAuthenticated: false });
  expect((await GET(get())).status).toBe(401);
  hoisted.auth.mockResolvedValueOnce({ isAuthenticated: true });
  const res = await GET(get());
  expect(res.status).toBe(403);
  expect(res.headers.get('Cache-Control')).toBe('no-store');
  hoisted.auth.mockResolvedValueOnce({ isAuthenticated: false });
  expect((await POST(post({}))).status).toBe(401);
  expect(hoisted.list).not.toHaveBeenCalled();
});

it('admin GET lists reports, clamps limit, and maps errors', async () => {
  const res = await GET(get('?limit=999'));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ reports: [{ id: 'r1' }] });
  expect(hoisted.list).toHaveBeenCalledWith(200);

  hoisted.list.mockRejectedValue(new Error('db down'));
  expect((await GET(get())).status).toBe(500);
});

it('admin POST validates input, applies takedown, and maps errors', async () => {
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

it('report intake accepts valid reports and returns a generic confirmation', async () => {
  const res = await reportPost(report(validReport));
  const data = await res.json();
  expect(res.status).toBe(202);
  expect(data.ok).toBe(true);
  expect(data.id).toBeUndefined();
  expect(hoisted.createFeedbackItem).toHaveBeenCalledWith(
    expect.objectContaining({
      source: 'abuse_report',
      context: expect.objectContaining({
        report: expect.objectContaining({
          targetType: 'profile',
          target: 'somehandle',
          category: 'phishing',
        }),
      }),
    })
  );
});

it('report intake rejects invalid input, rate limits, and maps errors', async () => {
  expect((await reportPost(report({ targetType: 'profile' }))).status).toBe(
    400
  );
  expect(
    (await reportPost(report({ ...validReport, category: 'nonsense' }))).status
  ).toBe(400);
  expect(hoisted.createFeedbackItem).not.toHaveBeenCalled();

  hoisted.rateLimit.mockResolvedValue({ success: false });
  expect((await reportPost(report(validReport))).status).toBe(429);

  hoisted.rateLimit.mockResolvedValue({ success: true });
  hoisted.createFeedbackItem.mockRejectedValue(new Error('db down'));
  expect((await reportPost(report(validReport))).status).toBe(500);
});
