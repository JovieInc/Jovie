import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bodyContainsOnboardingSessionBoundary } from '@/lib/canaries/auth-signup-onboarding';

const {
  checkAuthSurfaceGetMock,
  checkOnboardingChatProbeMock,
  verifyCronRequestMock,
  getRedisMock,
  captureErrorMock,
  addBreadcrumbMock,
  captureMessageMock,
} = vi.hoisted(() => ({
  checkAuthSurfaceGetMock: vi.fn(),
  checkOnboardingChatProbeMock: vi.fn(),
  verifyCronRequestMock: vi.fn(),
  getRedisMock: vi.fn(),
  captureErrorMock: vi.fn(),
  addBreadcrumbMock: vi.fn(),
  captureMessageMock: vi.fn(),
}));

vi.mock('@/lib/canaries/auth-signup-onboarding', async importActual => ({
  ...(await importActual<
    typeof import('@/lib/canaries/auth-signup-onboarding')
  >()),
  checkAuthSurfaceGet: checkAuthSurfaceGetMock,
  checkOnboardingChatProbe: checkOnboardingChatProbeMock,
}));

vi.mock('@/lib/cron/auth', () => ({
  verifyCronRequest: verifyCronRequestMock,
}));

vi.mock('@/lib/redis', () => ({
  getRedis: getRedisMock,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: captureErrorMock,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: addBreadcrumbMock,
  captureMessage: captureMessageMock,
}));

const okCheck = { name: 'ok', ok: true, detail: 'healthy', durationMs: 5 };

describe('GET /api/cron/auth-signup-onboarding-canary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyCronRequestMock.mockReturnValue(null);
    checkAuthSurfaceGetMock.mockResolvedValue(okCheck);
    checkOnboardingChatProbeMock.mockResolvedValue(okCheck);
    getRedisMock.mockReturnValue(null);
  });

  it('requires cron auth before probing production surfaces', async () => {
    verifyCronRequestMock.mockReturnValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );
    const { GET } = await import(
      '@/app/api/cron/auth-signup-onboarding-canary/route'
    );

    const response = await GET(
      new NextRequest('https://jov.ie/api/cron/auth-signup-onboarding-canary')
    );

    expect(response.status).toBe(401);
    expect(checkAuthSurfaceGetMock).not.toHaveBeenCalled();
  });

  it('asserts the SSR session boundary on /start', async () => {
    const { GET } = await import(
      '@/app/api/cron/auth-signup-onboarding-canary/route'
    );

    const response = await GET(
      new NextRequest('https://jov.ie/api/cron/auth-signup-onboarding-canary')
    );

    const startCall = checkAuthSurfaceGetMock.mock.calls.find(
      ([name]) => name === 'start-200'
    );
    expect(startCall?.[1]).toBe('https://jov.ie/start');
    // The interview mounts client-side after the restore fetch, so the HTTP
    // check must look for the SSR boundary marker, not init markers.
    expect(startCall?.[2]).toBe(bodyContainsOnboardingSessionBoundary);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('returns 207 and alerts when a surface check fails', async () => {
    checkOnboardingChatProbeMock.mockResolvedValue({
      name: 'onboarding-chat-gate',
      ok: false,
      detail: 'missing Turnstile gate',
      durationMs: 7,
    });
    const { GET } = await import(
      '@/app/api/cron/auth-signup-onboarding-canary/route'
    );

    const response = await GET(
      new NextRequest('https://jov.ie/api/cron/auth-signup-onboarding-canary')
    );

    expect(response.status).toBe(207);
    expect(captureMessageMock).toHaveBeenCalledWith(
      expect.stringContaining('onboarding-chat-gate'),
      'error'
    );
  });
});
