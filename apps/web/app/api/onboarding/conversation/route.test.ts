import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CanonicalUserState } from '@/lib/auth/canonical-user-state';

const mocks = vi.hoisted(() => ({
  gate: vi.fn(),
  session: vi.fn(),
  cookie: vi.fn(),
  clear: vi.fn(),
  find: vi.fn(),
  read: vi.fn(),
  restart: vi.fn(),
  capture: vi.fn(),
  rate: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/gate', () => ({ resolveUserState: mocks.gate }));
vi.mock('@/lib/auth/request-session', () => ({
  getRequestSession: mocks.session,
}));
vi.mock('@/lib/onboarding/session', () => ({
  getCurrentOnboardingSessionId: mocks.cookie,
  clearOnboardingSessionCookie: mocks.clear,
}));
vi.mock('@/lib/onboarding/conversation.server', () => ({
  findOnboardingConversation: mocks.find,
  readOnboardingMessages: mocks.read,
  restartOwnedOnboardingConversation: mocks.restart,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.capture }));
vi.mock('@/lib/rate-limit', () => ({
  checkOnboardingRateLimit: mocks.rate,
  createRateLimitHeaders: () => ({}),
  rateLimitDenialStatus: (rate: { unavailable?: boolean }) =>
    rate.unavailable ? 503 : 429,
}));

import { GET, POST } from './route';

function request(
  body: unknown = {
    action: 'restart',
    identityId: 'ba-a',
    conversationId: 'conversation-a',
  },
  extraHeaders: Record<string, string> = {}
) {
  return new Request('https://jov.ie/api/onboarding/conversation', {
    method: 'POST',
    headers: {
      origin: 'https://jov.ie',
      'content-type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.gate.mockResolvedValue({
    state: CanonicalUserState.WAITLIST_PENDING,
    clerkUserId: 'ba-a',
    dbUserId: 'app-a',
  });
  mocks.session.mockResolvedValue({ user: { id: 'ba-a' } });
  mocks.rate.mockResolvedValue({ success: true });
  mocks.cookie.mockResolvedValue(null);
  mocks.find.mockResolvedValue({ id: 'conversation-a', owned: true });
  mocks.read.mockResolvedValue([
    {
      id: 'message-a',
      role: 'user',
      parts: [{ type: 'text', text: 'My saved progress' }],
    },
  ]);
});

describe('onboarding restoration and explicit context actions', () => {
  it('restores the verified account after its anonymous claim cookie was cleared, without mutations', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({
      identityId: 'ba-a',
      conversationId: 'conversation-a',
      owned: true,
      messages: [{ id: 'message-a' }],
    });
    expect(mocks.session).toHaveBeenCalledWith('fresh');
    expect(mocks.find).toHaveBeenCalledWith({
      identityId: 'ba-a',
      userId: 'app-a',
      sessionId: null,
    });
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.restart).not.toHaveBeenCalled();
  });
  it('starts empty when the signed anonymous session is absent or invalid', async () => {
    mocks.gate.mockResolvedValue({
      state: CanonicalUserState.UNAUTHENTICATED,
      clerkUserId: null,
      dbUserId: null,
    });
    mocks.find.mockResolvedValue(null);
    expect(await (await GET()).json()).toEqual({
      identityId: null,
      conversationId: null,
      owned: false,
      messages: [],
    });
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each([
    CanonicalUserState.BANNED,
    CanonicalUserState.USER_CREATION_FAILED,
    CanonicalUserState.ACTIVE,
  ])('rejects %s before any transcript read or reset', async state => {
    mocks.gate.mockResolvedValue({ state });
    expect((await GET()).status).toBe(403);
    expect((await POST(request())).status).toBe(403);
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
  });
  it.each(['session', 'cookie', 'find', 'read'] as const)(
    'reports a %s failure instead of fabricating an empty transcript',
    async failing => {
      mocks[failing].mockRejectedValue(new Error('unavailable'));
      expect((await GET()).status).toBe(503);
    }
  );
  it('starts a new owned context without changing account/profile/payment history', async () => {
    expect((await POST(request())).status).toBe(200);
    expect(mocks.restart).toHaveBeenCalledExactlyOnceWith('app-a');
    expect(mocks.clear).toHaveBeenCalledOnce();
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('clears anonymous context for restart without manufacturing an account', async () => {
    mocks.gate.mockResolvedValue({
      state: CanonicalUserState.UNAUTHENTICATED,
      clerkUserId: null,
      dbUserId: null,
    });
    mocks.find.mockResolvedValue({ id: 'anonymous-a', owned: false });
    expect(
      (
        await POST(
          request({
            action: 'restart',
            identityId: null,
            conversationId: 'anonymous-a',
          })
        )
      ).status
    ).toBe(200);
    expect(mocks.restart).not.toHaveBeenCalled();
    expect(mocks.clear).toHaveBeenCalledOnce();
  });
  it('clears the anonymous cookie before supported logout, retaining account history', async () => {
    expect(
      (
        await POST(
          request({
            action: 'logout',
            identityId: 'ba-a',
            conversationId: 'conversation-a',
          })
        )
      ).status
    ).toBe(200);
    expect(mocks.clear).toHaveBeenCalledOnce();
    expect(mocks.restart).not.toHaveBeenCalled();
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.gate).not.toHaveBeenCalled();
  });
  it('keeps logout available when the saved conversation cannot be read', async () => {
    mocks.gate.mockRejectedValue(new Error('database unavailable'));
    mocks.find.mockRejectedValue(new Error('database unavailable'));
    expect(
      (await POST(request({ action: 'logout', identityId: 'ba-a' }))).status
    ).toBe(200);
    expect(mocks.clear).toHaveBeenCalledOnce();
  });
  it.each([false, true])(
    'preserves owned context when reset budget denies or is unavailable (%s)',
    async unavailable => {
      mocks.rate.mockResolvedValue({ success: false, unavailable });
      expect((await POST(request())).status).toBe(unavailable ? 503 : 429);
      expect(mocks.rate).toHaveBeenCalledWith('app-a', 'unknown');
      expect(mocks.restart).not.toHaveBeenCalled();
      expect(mocks.clear).not.toHaveBeenCalled();
    }
  );
  it('does not clear context or report success when durable restart fails', async () => {
    mocks.restart.mockRejectedValue(new Error('write failed'));
    expect((await POST(request())).status).toBe(503);
    expect(mocks.clear).not.toHaveBeenCalled();
  });
  it.each([
    { identityId: 'ba-b', conversationId: 'conversation-a' },
    { identityId: 'ba-a', conversationId: 'stale-conversation' },
  ])('rejects stale account/conversation actions %j', async locator => {
    expect(
      (await POST(request({ action: 'restart', ...locator }))).status
    ).toBe(409);
    expect(mocks.restart).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
  });
  it.each<Record<string, string>>([
    { origin: 'https://evil.example' },
    { origin: 'null' },
    { 'sec-fetch-site': 'cross-site' },
  ])('rejects cross-origin reset %j before resolving identity', async extra => {
    expect((await POST(request(undefined, extra))).status).toBe(403);
    expect(mocks.gate).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
  });
  it('rejects unsupported actions without mutation', async () => {
    expect((await POST(request({ action: 'delete-account' }))).status).toBe(
      400
    );
    expect(mocks.restart).not.toHaveBeenCalled();
  });
  it('rejects malformed reset JSON without resolving or mutating account state', async () => {
    const malformed = new Request(
      'https://jov.ie/api/onboarding/conversation',
      { method: 'POST', headers: { origin: 'https://jov.ie' }, body: '{broken' }
    );
    expect((await POST(malformed)).status).toBe(400);
    expect(mocks.gate).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
  });
});
