import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  record: vi.fn(),
  session: vi.fn(),
  auth: vi.fn(),
  limit: vi.fn(),
  bot: vi.fn(),
}));
vi.mock('@/lib/analytics/signup-replay.server', () => ({
  recordSignupReplay: mocks.record,
  SENTRY_REPLAY_ID_PATTERN: /^[0-9a-f]{32}$/,
}));
vi.mock('@/lib/onboarding/session', () => ({
  getCurrentOnboardingSessionId: mocks.session,
}));
vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: mocks.auth }));
vi.mock('@/lib/rate-limit', () => ({
  getClientIP: () => '203.0.113.1',
  trackingIpVisitsLimiter: { limit: mocks.limit },
}));
vi.mock('@/lib/utils/bot-detection', () => ({ detectBot: mocks.bot }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

import { POST } from './route';

const ID = 'a'.repeat(32);
const post = (body: string) =>
  POST(
    new NextRequest('https://jov.ie/api/onboarding/replay', {
      method: 'POST',
      body,
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.bot.mockReturnValue({ isBot: false });
  mocks.limit.mockResolvedValue({ success: true });
  mocks.session.mockResolvedValue('session-1');
  mocks.auth.mockResolvedValue({ userId: null });
});

it('attaches server-verified identity, never a caller-supplied one', async () => {
  mocks.auth.mockResolvedValue({ userId: 'user-1' });
  const res = await post(JSON.stringify({ replayId: ID }));
  expect(res.status).toBe(204);
  expect(mocks.record).toHaveBeenCalledWith({
    replayId: ID,
    onboardingSessionId: 'session-1',
    userId: 'user-1',
  });
});

it('rejects malformed ids and extra fields', async () => {
  expect((await post(JSON.stringify({ replayId: 'nope' }))).status).toBe(400);
  expect(
    (await post(JSON.stringify({ replayId: ID, userId: 'x' }))).status
  ).toBe(400);
  expect((await post('{')).status).toBe(400);
  expect(mocks.record).not.toHaveBeenCalled();
});

it('drops bots and rate-limited callers silently', async () => {
  mocks.bot.mockReturnValue({ isBot: true });
  expect((await post(JSON.stringify({ replayId: ID }))).status).toBe(204);
  mocks.bot.mockReturnValue({ isBot: false });
  mocks.limit.mockResolvedValue({ success: false });
  expect((await post(JSON.stringify({ replayId: ID }))).status).toBe(204);
  expect(mocks.record).not.toHaveBeenCalled();
});
