import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activateSuggestedArtistRule: vi.fn(),
  createConfirmedArtistRule: vi.fn(),
  getCachedAuth: vi.fn(),
  getExactProfileAccess: vi.fn(),
  listArtistRulesForProfile: vi.fn(),
  revokeArtistRule: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: mocks.getCachedAuth }));
vi.mock('@/lib/auth/profile-access', () => ({
  getExactProfileAccess: mocks.getExactProfileAccess,
}));
vi.mock('@/lib/artist-rules/store', () => ({
  activateSuggestedArtistRule: mocks.activateSuggestedArtistRule,
  createConfirmedArtistRule: mocks.createConfirmedArtistRule,
  listArtistRulesForProfile: mocks.listArtistRulesForProfile,
  revokeArtistRule: mocks.revokeArtistRule,
}));
vi.mock('@/lib/db', () => ({ db: {} }));

import { DELETE, PATCH, POST } from './route';

const profileId = '11111111-1111-4111-8111-111111111111';
const ruleId = '22222222-2222-4222-8222-222222222222';

describe('artist rules route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCachedAuth.mockResolvedValue({ userId: 'app-user-id' });
    mocks.getExactProfileAccess.mockResolvedValue({
      ok: true,
      profileId,
      ownerUserId: 'app-user-id',
    });
  });

  it('rejects cross-profile rule mutations', async () => {
    mocks.getExactProfileAccess.mockResolvedValue({
      ok: false,
      reason: 'forbidden',
    });
    const response = await POST(
      new Request('http://localhost/api/artist-rules', {
        method: 'POST',
        body: JSON.stringify({
          creatorProfileId: profileId,
          category: 'visual',
          ruleKey: 'palette',
          instruction: 'never use yellow',
          strength: 'hard_constraint',
          allowOverride: false,
        }),
      })
    );
    expect(response.status).toBe(403);
    expect(mocks.createConfirmedArtistRule).not.toHaveBeenCalled();
  });

  it('creates a directly confirmed artist rule', async () => {
    mocks.createConfirmedArtistRule.mockResolvedValue({ id: ruleId });
    const response = await POST(
      new Request('http://localhost/api/artist-rules', {
        method: 'POST',
        body: JSON.stringify({
          creatorProfileId: profileId,
          category: 'voice',
          ruleKey: 'casing',
          instruction: 'use only lowercase text',
          strength: 'hard_constraint',
          allowOverride: false,
        }),
      })
    );
    expect(response.status).toBe(201);
    expect(mocks.createConfirmedArtistRule).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorProfileId: profileId,
        actorUserId: 'app-user-id',
        ruleKey: 'casing',
      })
    );
  });

  it('requires an explicit confirmation action for a suggestion', async () => {
    mocks.activateSuggestedArtistRule.mockResolvedValue({ id: ruleId });
    const response = await PATCH(
      new Request('http://localhost/api/artist-rules', {
        method: 'PATCH',
        body: JSON.stringify({
          creatorProfileId: profileId,
          ruleId,
          action: 'activate',
        }),
      })
    );
    expect(response.status).toBe(200);
    expect(mocks.activateSuggestedArtistRule).toHaveBeenCalledWith({
      creatorProfileId: profileId,
      ruleId,
      actorUserId: 'app-user-id',
    });
  });

  it('revokes only an active rule on the authorized profile', async () => {
    mocks.revokeArtistRule.mockResolvedValue(true);
    const response = await DELETE(
      new Request('http://localhost/api/artist-rules', {
        method: 'DELETE',
        body: JSON.stringify({ creatorProfileId: profileId, ruleId }),
      })
    );
    expect(response.status).toBe(200);
    expect(mocks.revokeArtistRule).toHaveBeenCalledWith({
      creatorProfileId: profileId,
      ruleId,
      actorUserId: 'app-user-id',
    });
  });
});
