import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  record: vi.fn(),
  flush: vi.fn(),
  count: vi.fn(),
  serverTrigger: vi.fn(),
  session: vi.fn(),
  auth: vi.fn(),
  limit: vi.fn(),
  bot: vi.fn(),
}));
vi.mock('@/lib/analytics/signup-replay.server', () => ({
  recordSignupReplay: mocks.record,
  recordReplayFlush: mocks.flush,
  countPeriodFlushes: mocks.count,
  resolveServerFlushTrigger: mocks.serverTrigger,
  REPLAY_MONTHLY_CAP: 45,
  REPLAY_FLUSH_TRIGGERS: ['claim_idle', 'client_error', 'signup'],
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
  mocks.count.mockResolvedValue(3);
  mocks.record.mockResolvedValue(null);
  mocks.serverTrigger.mockResolvedValue(null);
  mocks.flush.mockResolvedValue(true);
});

it('attaches server-verified identity, never a caller-supplied one', async () => {
  mocks.auth.mockResolvedValue({ userId: 'user-1' });
  const res = await post(JSON.stringify({ replayId: ID }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ canFlush: true, flush: null });
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

it('stops offering flushes once the monthly count nears the cap', async () => {
  mocks.count.mockResolvedValue(45);
  mocks.serverTrigger.mockResolvedValue('signup');
  const res = await post(JSON.stringify({ replayId: ID }));
  expect(await res.json()).toEqual({ canFlush: false, flush: null });
  expect(mocks.serverTrigger).not.toHaveBeenCalled();
});

it('names a success-path trigger for a new account', async () => {
  mocks.serverTrigger.mockResolvedValue('signup');
  const res = await post(JSON.stringify({ replayId: ID }));
  expect(await res.json()).toEqual({ canFlush: true, flush: 'signup' });
});

it('records a reported flush with its trigger', async () => {
  const res = await post(
    JSON.stringify({ replayId: ID, trigger: 'claim_idle' })
  );
  expect(await res.json()).toEqual({ flushed: true });
  expect(mocks.flush).toHaveBeenCalledWith({
    replayId: ID,
    trigger: 'claim_idle',
    onboardingSessionId: 'session-1',
    userId: null,
  });
  expect(
    (await post(JSON.stringify({ replayId: ID, trigger: 'bogus' }))).status
  ).toBe(400);
});
