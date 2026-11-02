import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  isTurnstileConfigured: vi.fn(),
  verifyTurnstileToken: vi.fn(),
  joinWaitlistWithRole: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({
  waitlistJoinLimiter: { limit: mocks.limit },
  createRateLimitHeaders: vi.fn(() => ({})),
  getClientIP: vi.fn(() => '203.0.113.7'),
}));
vi.mock('@/lib/turnstile/verify', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/turnstile/verify')>()),
  isTurnstileConfigured: mocks.isTurnstileConfigured,
  verifyTurnstileToken: mocks.verifyTurnstileToken,
}));
vi.mock('@/lib/waitlist/role-entry', () => ({
  joinWaitlistWithRole: mocks.joinWaitlistWithRole,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.captureError }));

import { POST } from '@/app/api/waitlist/join/route';

function request(body: unknown) {
  return new NextRequest('https://jov.ie/api/waitlist/join', {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: 'jov.ie' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const validBody = {
  email: ' Person@Example.com ',
  role: 'manager',
  turnstileToken: 'ts-token',
};

describe('POST /api/waitlist/join', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FEATURE_PUBLIC_SIGNUP_CLOSED = 'true';
    mocks.limit.mockResolvedValue({ success: true });
    mocks.isTurnstileConfigured.mockReturnValue(true);
    mocks.verifyTurnstileToken.mockResolvedValue({ success: true });
    mocks.joinWaitlistWithRole.mockResolvedValue({ created: true });
  });

  afterEach(() => {
    delete process.env.FEATURE_PUBLIC_SIGNUP_CLOSED;
  });

  it('is inert while public signup is open', async () => {
    delete process.env.FEATURE_PUBLIC_SIGNUP_CLOSED;
    const response = await POST(request(validBody));
    expect(response.status).toBe(404);
    expect(mocks.joinWaitlistWithRole).not.toHaveBeenCalled();
  });

  it('stores the role and normalized email after Turnstile passes', async () => {
    const response = await POST(request(validBody));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ state: 'joined' });
    expect(mocks.verifyTurnstileToken).toHaveBeenCalledWith(
      'ts-token',
      '203.0.113.7',
      'jov.ie'
    );
    expect(mocks.joinWaitlistWithRole).toHaveBeenCalledWith({
      email: 'person@example.com',
      role: 'manager',
    });
  });

  it('answers a known email exactly like a new one', async () => {
    mocks.joinWaitlistWithRole.mockResolvedValue({ created: false });
    const response = await POST(request(validBody));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ state: 'joined' });
  });

  it('rejects an unknown role or a bad email', async () => {
    expect((await POST(request({ ...validBody, role: 'fan' }))).status).toBe(
      400
    );
    expect(
      (await POST(request({ ...validBody, email: 'not-an-email' }))).status
    ).toBe(400);
    expect((await POST(request('{bad json'))).status).toBe(400);
    expect(mocks.joinWaitlistWithRole).not.toHaveBeenCalled();
  });

  it('blocks bots that fail Turnstile', async () => {
    mocks.verifyTurnstileToken.mockResolvedValue({
      success: false,
      errorCodes: ['invalid-input-response'],
    });
    const response = await POST(request(validBody));
    expect(response.status).toBe(403);
    expect(mocks.joinWaitlistWithRole).not.toHaveBeenCalled();
  });

  it('rate limits per IP before any work', async () => {
    mocks.limit.mockResolvedValue({ success: false, reason: 'limit' });
    const response = await POST(request(validBody));
    expect(response.status).toBe(429);
    expect(mocks.verifyTurnstileToken).not.toHaveBeenCalled();
  });

  it('fails closed when the write fails', async () => {
    mocks.joinWaitlistWithRole.mockRejectedValue(new Error('db down'));
    const response = await POST(request(validBody));
    expect(response.status).toBe(500);
    expect(mocks.captureError).toHaveBeenCalled();
  });
});
