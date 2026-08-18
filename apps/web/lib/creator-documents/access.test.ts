import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getExactProfileAccess } = vi.hoisted(() => ({
  getExactProfileAccess: vi.fn(),
}));

vi.mock('@/lib/auth/profile-access', () => ({ getExactProfileAccess }));
vi.mock('@/lib/db', () => ({ db: {} }));

import { requireCreatorDocumentAccess } from './access';

const input = {
  userId: '11111111-1111-4111-8111-111111111111',
  profileId: '22222222-2222-4222-8222-222222222222',
};

describe('requireCreatorDocumentAccess', () => {
  beforeEach(() => vi.clearAllMocks());

  it('preserves supported legacy-owner access when no canonical claim exists', async () => {
    getExactProfileAccess.mockResolvedValue({
      ok: true,
      profileId: input.profileId,
      ownerUserId: input.userId,
    });

    await expect(requireCreatorDocumentAccess(input)).resolves.toBeUndefined();
    await expect(
      requireCreatorDocumentAccess({ ...input, ownerOnly: true })
    ).resolves.toBeUndefined();
  });

  it('does not promote manager access to owner-only approval', async () => {
    getExactProfileAccess.mockResolvedValue({
      ok: true,
      profileId: input.profileId,
      ownerUserId: '33333333-3333-4333-8333-333333333333',
    });

    await expect(requireCreatorDocumentAccess(input)).resolves.toBeUndefined();
    await expect(
      requireCreatorDocumentAccess({ ...input, ownerOnly: true })
    ).rejects.toThrow('Unauthorized');
  });
});
