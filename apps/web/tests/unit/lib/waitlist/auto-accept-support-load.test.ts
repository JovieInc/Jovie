import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  settings: vi.fn(),
  supportLoad: vi.fn(),
  select: vi.fn(),
  approve: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: { select: mocks.select } }));
vi.mock('@/lib/acquisition/eligibility.server', () => ({
  readCachedAcquisitionEligibility: vi.fn(),
}));
vi.mock('@/lib/waitlist/settings', () => ({
  getWaitlistSettings: mocks.settings,
  tryReserveAutoAcceptSlot: vi.fn(),
}));
vi.mock('@/lib/waitlist/support-load.server', () => ({
  readSupportLoadCapacity: mocks.supportLoad,
}));
vi.mock('@/lib/waitlist/approval', () => ({
  approveWaitlistEntryInTx: mocks.approve,
  finalizeWaitlistApproval: vi.fn(),
}));
vi.mock('@/lib/waitlist/cohort-learnings', () => ({
  MAX_OPEN_COHORT_LEARNINGS: 10,
  countOpenCohortLearnings: vi.fn(),
}));
vi.mock('@/lib/waitlist/email-jobs', () => ({
  enqueueWaitlistApprovalInviteEmail: vi.fn(),
}));
vi.mock('@/lib/db/serializable-retry', () => ({
  withSerializableRetry: vi.fn(),
}));
vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: vi.fn(),
}));

import { runWaitlistAutoAccept } from '@/lib/waitlist/auto-accept';

describe('daily auto-accept under support load', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.settings.mockResolvedValue({
      autoAcceptEnabled: true,
      autoAcceptAfterDays: 7,
      autoAcceptDailyLimit: 10,
      autoAcceptedToday: 5,
    });
  });

  it('pauses the drain while open bug reports hold admission', async () => {
    mocks.supportLoad.mockResolvedValue({
      band: 'hold',
      dailyLimit: 0,
      remaining: 0,
    });
    expect(await runWaitlistAutoAccept()).toMatchObject({
      approved: 0,
      capacityRemaining: 0,
      pausedReason: 'support_load',
    });
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.approve).not.toHaveBeenCalled();
  });

  it('spends the narrowed budget, not the stored limit', async () => {
    mocks.supportLoad.mockResolvedValue({
      band: 'narrow',
      dailyLimit: 5,
      remaining: 0,
    });
    const result = await runWaitlistAutoAccept();
    expect(mocks.supportLoad).toHaveBeenCalledWith(
      expect.objectContaining({ autoAcceptDailyLimit: 10 })
    );
    expect(result).toMatchObject({ approved: 0, capacityRemaining: 0 });
    expect(result.pausedReason).toBeUndefined();
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
