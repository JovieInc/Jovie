import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLimit, mockDb, mockCaptureWarning } = vi.hoisted(() => {
  const mockLimit = vi.fn();
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: mockLimit,
  };
  return {
    mockLimit,
    mockDb: { select: () => chain },
    mockCaptureWarning: vi.fn(),
  };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/error-tracking', () => ({
  captureWarning: mockCaptureWarning,
}));

import { loadClaimTimeProof } from './claim-time-proof.server';

const outputs = {
  kind: 'onboarding_presence_build',
  schemaVersion: 1,
  profileId: 'profile-1',
  conversationId: 'c',
  messageId: 'm',
  userId: 'u',
  toolEvents: [],
  steps: {
    assemble_profile: {
      id: 'assemble_profile',
      status: 'completed',
      artifact: {
        title: 'Profile assembly',
        summary: 'Assembled 1 section.',
        facts: [
          { label: 'Tracks', value: '12' },
          { label: 'Releases', value: '0' },
        ],
      },
    },
  },
};

describe('loadClaimTimeProof', () => {
  beforeEach(() => {
    mockLimit.mockReset();
    mockCaptureWarning.mockReset();
  });

  it('returns the real findings of the latest presence build', async () => {
    mockLimit.mockResolvedValue([{ stepOutputs: outputs }]);
    await expect(loadClaimTimeProof('profile-1')).resolves.toEqual([
      {
        slot: 'assembled-profile',
        title: 'Profile assembly',
        facts: [{ label: 'Tracks', value: '12' }],
      },
    ]);
  });

  it('hides proof when no run exists or the run is malformed', async () => {
    mockLimit.mockResolvedValue([]);
    await expect(loadClaimTimeProof('profile-1')).resolves.toEqual([]);
    mockLimit.mockResolvedValue([{ stepOutputs: { kind: 'other' } }]);
    await expect(loadClaimTimeProof('profile-1')).resolves.toEqual([]);
  });

  it('hides proof and reports when the read fails', async () => {
    mockLimit.mockRejectedValue(new Error('db down'));
    await expect(loadClaimTimeProof('profile-1')).resolves.toEqual([]);
    expect(mockCaptureWarning).toHaveBeenCalledOnce();
  });
});
