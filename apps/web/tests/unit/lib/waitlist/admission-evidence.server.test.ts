import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readCached: vi.fn(),
  learnings: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/acquisition/eligibility.server', () => ({
  readCachedAcquisitionEligibility: mocks.readCached,
}));
vi.mock('@/lib/waitlist/cohort-learnings', () => ({
  countOpenCohortLearnings: mocks.learnings,
  MAX_OPEN_COHORT_LEARNINGS: 10,
}));

import { readFreshAdmissionEvidenceHold } from '@/lib/waitlist/admission-evidence.server';

describe('readFreshAdmissionEvidenceHold', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readCached.mockResolvedValue({
      eligible: true,
      verdict: 'ELIGIBLE',
    });
    mocks.learnings.mockResolvedValue(0);
  });

  it('passes only when eligibility is green and learnings are under the cap', async () => {
    expect(await readFreshAdmissionEvidenceHold()).toBeNull();
    expect(mocks.learnings).toHaveBeenCalledTimes(1);
  });

  it.each([
    null,
    { eligible: false, verdict: 'BLOCKED' },
    { eligible: false, verdict: 'ELIGIBLE' },
    { eligible: true, verdict: 'UNKNOWN' },
  ])('holds on readiness %j without reading learnings', async report => {
    mocks.readCached.mockResolvedValue(report);
    expect(await readFreshAdmissionEvidenceHold()).toBe(
      'golden_path_not_green'
    );
    expect(mocks.learnings).not.toHaveBeenCalled();
  });

  it('holds when the readiness read throws', async () => {
    mocks.readCached.mockRejectedValue(new Error('redis down'));
    expect(await readFreshAdmissionEvidenceHold()).toBe(
      'golden_path_not_green'
    );
    expect(mocks.learnings).not.toHaveBeenCalled();
  });

  it('holds when cohort learnings are unreadable or at the cap', async () => {
    mocks.learnings.mockResolvedValue(null);
    expect(await readFreshAdmissionEvidenceHold()).toBe(
      'learnings_unavailable'
    );
    mocks.learnings.mockResolvedValue(10);
    expect(await readFreshAdmissionEvidenceHold()).toBe('open_learnings');
  });

  it('reads learnings again on the next admission attempt', async () => {
    await readFreshAdmissionEvidenceHold();
    await readFreshAdmissionEvidenceHold();
    expect(mocks.learnings).toHaveBeenCalledTimes(2);
  });
});
