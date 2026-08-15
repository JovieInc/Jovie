import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  class CompletionError extends Error {
    constructor(
      readonly code:
        | 'forbidden'
        | 'invalid_display_name'
        | 'invalid_handle'
        | 'handle_taken'
        | 'user_not_found',
      message: string
    ) {
      super(message);
    }
  }

  return {
    captureErrorMock: vi.fn(),
    completeMobileProfileMock: vi.fn(),
    CompletionError,
    getMobileSessionUserIdMock: vi.fn(),
  };
});

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

vi.mock('@/lib/mobile/complete-profile', () => ({
  completeMobileProfile: hoisted.completeMobileProfileMock,
  MobileProfileCompletionError: hoisted.CompletionError,
}));

vi.mock('@/lib/mobile/session-auth', () => ({
  getMobileSessionUserId: hoisted.getMobileSessionUserIdMock,
}));

const routeModulePromise = import('@/app/api/mobile/v1/profile/complete/route');

function makeRequest(
  body: unknown = { displayName: 'Tim White', username: 'tim' }
) {
  return new Request('https://jov.ie/api/mobile/v1/profile/complete', {
    body: JSON.stringify(body),
    headers: {
      Authorization: 'Bearer native-session',
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
}

describe('POST /api/mobile/v1/profile/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getMobileSessionUserIdMock.mockResolvedValue('app-user-uuid');
    hoisted.completeMobileProfileMock.mockResolvedValue({
      displayName: 'Tim White',
      profileId: 'profile-uuid',
      username: 'tim',
    });
  });

  it('requires a valid native bearer session', async () => {
    hoisted.getMobileSessionUserIdMock.mockResolvedValue(null);

    const { POST } = await routeModulePromise;
    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(hoisted.completeMobileProfileMock).not.toHaveBeenCalled();
  });

  it('completes the profile for the bearer-resolved app user', async () => {
    const { POST } = await routeModulePromise;
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(hoisted.completeMobileProfileMock).toHaveBeenCalledWith({
      displayName: 'Tim White',
      userId: 'app-user-uuid',
      username: 'tim',
    });
    await expect(response.json()).resolves.toEqual({
      displayName: 'Tim White',
      profileId: 'profile-uuid',
      username: 'tim',
    });
  });

  it('returns a deterministic conflict without exposing internals', async () => {
    hoisted.completeMobileProfileMock.mockRejectedValue(
      new hoisted.CompletionError(
        'handle_taken',
        'That handle is already taken.'
      )
    );

    const { POST } = await routeModulePromise;
    const response = await POST(makeRequest());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: 'handle_taken',
      error: 'That handle is already taken.',
    });
    expect(hoisted.captureErrorMock).not.toHaveBeenCalled();
  });

  it('rejects malformed completion payloads', async () => {
    const { POST } = await routeModulePromise;
    const response = await POST(makeRequest({ displayName: 'Tim White' }));

    expect(response.status).toBe(400);
    expect(hoisted.completeMobileProfileMock).not.toHaveBeenCalled();
  });
});
