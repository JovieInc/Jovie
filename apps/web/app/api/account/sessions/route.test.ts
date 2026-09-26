import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockListAccountSessions } = vi.hoisted(() => ({
  mockListAccountSessions: vi.fn(),
}));

vi.mock('@/lib/auth/sessions', () => ({
  listAccountSessions: mockListAccountSessions,
}));

vi.mock('@/lib/auth/session', () => ({
  isUnauthorizedSessionError: (error: unknown) =>
    error instanceof Error && error.message === 'Unauthorized',
}));

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }));

const { GET } = await import('./route');

describe('GET /api/account/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the current sessions', async () => {
    const sessions = [
      {
        id: 'session-1',
        ipAddress: '1.1.1.1',
        userAgent: 'ua-1',
        lastActiveAt: '2026-01-01T00:00:00.000Z',
        isCurrent: true,
      },
    ];
    mockListAccountSessions.mockResolvedValue(sessions);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sessions });
  });

  it('returns 401 when unauthenticated', async () => {
    mockListAccountSessions.mockRejectedValue(new Error('Unauthorized'));

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it('returns 500 on unexpected errors', async () => {
    mockListAccountSessions.mockRejectedValue(new Error('boom'));

    const response = await GET();

    expect(response.status).toBe(500);
  });
});
