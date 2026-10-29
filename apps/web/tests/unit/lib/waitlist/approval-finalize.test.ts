import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invalidate: vi.fn(),
  schedule: vi.fn(),
}));

vi.mock('@/lib/auth/proxy-state', () => ({
  invalidateProxyUserStateCache: mocks.invalidate,
}));
vi.mock('@/lib/waitlist/profile-certification-runner.server', () => ({
  scheduleProfileCertification: mocks.schedule,
}));

import { finalizeWaitlistApproval } from '@/lib/waitlist/approval';

const approved = {
  outcome: 'approved' as const,
  entryId: 'entry-1',
  email: 'a@example.com',
  fullName: null,
  clerkId: 'user-1',
};

describe('finalizeWaitlistApproval', () => {
  beforeEach(() => vi.clearAllMocks());

  it('certifies the approved profile (waitlist gate event)', async () => {
    await finalizeWaitlistApproval({ ...approved, profileId: 'profile-1' });
    expect(mocks.invalidate).toHaveBeenCalledWith('user-1');
    expect(mocks.schedule).toHaveBeenCalledWith({
      profileId: 'profile-1',
      trigger: 'waitlist_approval',
    });
  });

  it('skips certification when the entry has no profile', async () => {
    await finalizeWaitlistApproval({ ...approved, profileId: null });
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it('never fails the approval when certification cannot be scheduled', async () => {
    mocks.schedule.mockImplementation(() => {
      throw new Error('after() unavailable');
    });
    await expect(
      finalizeWaitlistApproval({ ...approved, profileId: 'profile-1' })
    ).resolves.toBeUndefined();
  });
});
