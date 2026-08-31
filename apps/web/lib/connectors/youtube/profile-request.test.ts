import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCachedAuth: vi.fn(),
  getExactProfileAccess: vi.fn(),
  dbMock: {},
}));

vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: mocks.getCachedAuth }));
vi.mock('@/lib/auth/profile-access', () => ({
  getExactProfileAccess: mocks.getExactProfileAccess,
}));
vi.mock('@/lib/db', () => ({ db: mocks.dbMock }));

import { validateYouTubeProfileMutationRequest } from './profile-request';

const profileId = '11111111-1111-4111-8111-111111111111';

function request(body: unknown = { creatorProfileId: profileId }) {
  return new Request('http://localhost/api/connectors/youtube', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('validateYouTubeProfileMutationRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCachedAuth.mockResolvedValue({ userId: 'user-1' });
    mocks.getExactProfileAccess.mockResolvedValue({ ok: true });
  });

  it('requires authentication', async () => {
    mocks.getCachedAuth.mockResolvedValueOnce({ userId: null });
    const result = await validateYouTubeProfileMutationRequest(request());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(mocks.getExactProfileAccess).not.toHaveBeenCalled();
  });

  it('requires a valid creator profile id payload', async () => {
    const result = await validateYouTubeProfileMutationRequest(
      request({ creatorProfileId: 'not-a-uuid' })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
    expect(mocks.getExactProfileAccess).not.toHaveBeenCalled();
  });

  it('requires exact profile access', async () => {
    mocks.getExactProfileAccess.mockResolvedValueOnce({ ok: false });
    const result = await validateYouTubeProfileMutationRequest(request());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it('returns the authenticated user and profile ids', async () => {
    await expect(
      validateYouTubeProfileMutationRequest(request())
    ).resolves.toEqual({
      ok: true,
      userId: 'user-1',
      creatorProfileId: profileId,
    });
    expect(mocks.getExactProfileAccess).toHaveBeenCalledWith(
      mocks.dbMock,
      'user-1',
      profileId
    );
  });
});
