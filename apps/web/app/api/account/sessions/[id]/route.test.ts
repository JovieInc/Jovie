import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockRevokeAccountSession,
  SessionNotFoundError,
  CannotRevokeCurrentSessionError,
} = vi.hoisted(() => {
  class SessionNotFoundError extends Error {
    constructor() {
      super('Session not found');
      this.name = 'SessionNotFoundError';
    }
  }
  class CannotRevokeCurrentSessionError extends Error {
    constructor() {
      super('Sign out of this device instead of ending its own session');
      this.name = 'CannotRevokeCurrentSessionError';
    }
  }
  return {
    mockRevokeAccountSession: vi.fn(),
    SessionNotFoundError,
    CannotRevokeCurrentSessionError,
  };
});

vi.mock('@/lib/auth/sessions', () => ({
  revokeAccountSession: mockRevokeAccountSession,
  SessionNotFoundError,
  CannotRevokeCurrentSessionError,
}));

vi.mock('@/lib/auth/session', () => ({
  isUnauthorizedSessionError: (error: unknown) =>
    error instanceof Error && error.message === 'Unauthorized',
}));

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }));

const { DELETE } = await import('./route');

function buildParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('DELETE /api/account/sessions/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ends the requested session', async () => {
    mockRevokeAccountSession.mockResolvedValue(undefined);

    const response = await DELETE(
      new Request('http://localhost'),
      buildParams('session-1')
    );

    expect(response.status).toBe(200);
    expect(mockRevokeAccountSession).toHaveBeenCalledWith('session-1');
  });

  it('returns 401 when unauthenticated', async () => {
    mockRevokeAccountSession.mockRejectedValue(new Error('Unauthorized'));

    const response = await DELETE(
      new Request('http://localhost'),
      buildParams('session-1')
    );

    expect(response.status).toBe(401);
  });

  it('returns 404 for a session that does not exist or is not owned', async () => {
    mockRevokeAccountSession.mockRejectedValue(new SessionNotFoundError());

    const response = await DELETE(
      new Request('http://localhost'),
      buildParams('missing')
    );

    expect(response.status).toBe(404);
  });

  it('refuses to end the current session', async () => {
    mockRevokeAccountSession.mockRejectedValue(
      new CannotRevokeCurrentSessionError()
    );

    const response = await DELETE(
      new Request('http://localhost'),
      buildParams('session-current')
    );

    expect(response.status).toBe(400);
  });

  it('returns 500 on unexpected errors', async () => {
    mockRevokeAccountSession.mockRejectedValue(new Error('boom'));

    const response = await DELETE(
      new Request('http://localhost'),
      buildParams('session-1')
    );

    expect(response.status).toBe(500);
  });
});
