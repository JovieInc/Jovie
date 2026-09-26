import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRevokeOtherAccountSessions } = vi.hoisted(() => ({
  mockRevokeOtherAccountSessions: vi.fn(),
}));

vi.mock('@/lib/auth/sessions', () => ({
  revokeOtherAccountSessions: mockRevokeOtherAccountSessions,
}));

vi.mock('@/lib/auth/session', () => ({
  isUnauthorizedSessionError: (error: unknown) =>
    error instanceof Error && error.message === 'Unauthorized',
}));

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }));

const { POST } = await import('./route');

describe('POST /api/account/sessions/revoke-others', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('signs out every other session', async () => {
    mockRevokeOtherAccountSessions.mockResolvedValue(undefined);

    const response = await POST();

    expect(response.status).toBe(200);
    expect(mockRevokeOtherAccountSessions).toHaveBeenCalledOnce();
  });

  it('returns 401 when unauthenticated', async () => {
    mockRevokeOtherAccountSessions.mockRejectedValue(new Error('Unauthorized'));

    const response = await POST();

    expect(response.status).toBe(401);
  });

  it('returns 500 on unexpected errors', async () => {
    mockRevokeOtherAccountSessions.mockRejectedValue(new Error('boom'));

    const response = await POST();

    expect(response.status).toBe(500);
  });
});
