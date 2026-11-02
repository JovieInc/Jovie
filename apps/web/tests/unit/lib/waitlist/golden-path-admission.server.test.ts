import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readCached: vi.fn(),
  settings: vi.fn(),
  learnings: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/acquisition/eligibility.server', () => ({
  readCachedAcquisitionEligibility: mocks.readCached,
}));
vi.mock('@/lib/waitlist/settings', () => ({
  getWaitlistSettings: mocks.settings,
}));
vi.mock('@/lib/waitlist/cohort-learnings', () => ({
  countOpenCohortLearnings: mocks.learnings,
  MAX_OPEN_COHORT_LEARNINGS: 3,
}));

import {
  decideGoldenPathAdmissionForArtist,
  readGoldenPathTurnContext,
  resetGoldenPathAdmissionCaches,
} from '@/lib/waitlist/golden-path-admission.server';

const artist = { spotifyArtistId: '4Uwpa6zW3zzCSQvooQNksm', reach: 3_200 };
const green = { eligible: true, verdict: 'ELIGIBLE' };
const roomy = {
  autoAcceptEnabled: true,
  autoAcceptDailyLimit: 10,
  autoAcceptedToday: 2,
};

describe('golden-path admission server reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGoldenPathAdmissionCaches();
    mocks.readCached.mockResolvedValue(green);
    mocks.settings.mockResolvedValue(roomy);
    mocks.learnings.mockResolvedValue(0);
  });

  it('admits a resolved artist when green, with capacity and an open throttle', async () => {
    expect(await decideGoldenPathAdmissionForArtist(artist)).toEqual({
      admit: true,
      reason: 'admit_resolved_artist',
    });
  });

  it('never triggers the heavy eligibility recompute: a cache miss holds', async () => {
    mocks.readCached.mockResolvedValue(null);
    expect(await decideGoldenPathAdmissionForArtist(artist)).toEqual({
      admit: false,
      reason: 'hold_golden_path_not_green',
    });
  });

  it('does not trust a cached report that is not eligible even if it says ELIGIBLE', async () => {
    mocks.readCached.mockResolvedValue({
      eligible: false,
      verdict: 'ELIGIBLE',
    });
    expect((await decideGoldenPathAdmissionForArtist(artist)).admit).toBe(
      false
    );
  });

  it.each([
    [{ ...roomy, autoAcceptEnabled: false }, 'hold_auto_accept_disabled'],
    [{ ...roomy, autoAcceptedToday: 10 }, 'hold_capacity_full'],
  ])('holds with the exact capacity reason', async (settings, reason) => {
    mocks.settings.mockResolvedValue(settings);
    expect(await decideGoldenPathAdmissionForArtist(artist)).toEqual({
      admit: false,
      reason,
    });
  });

  it('holds when the cohort-learnings throttle is closed or unreadable', async () => {
    mocks.learnings.mockResolvedValue(3);
    expect(await decideGoldenPathAdmissionForArtist(artist)).toEqual({
      admit: false,
      reason: 'hold_open_learnings',
    });
    resetGoldenPathAdmissionCaches();
    mocks.learnings.mockResolvedValue(null);
    expect((await decideGoldenPathAdmissionForArtist(artist)).admit).toBe(
      false
    );
  });

  it('fails closed when settings cannot be read', async () => {
    mocks.settings.mockRejectedValue(new Error('db down'));
    const context = await readGoldenPathTurnContext();
    expect(context.holdReason).toBe('hold_capacity_full');
  });

  it('reads the throttle once per minute, not once per turn', async () => {
    await readGoldenPathTurnContext();
    await readGoldenPathTurnContext();
    expect(mocks.learnings).toHaveBeenCalledTimes(1);
  });
});
