import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCachedAuth: vi.fn(),
  isPmfSurveyEligibleForUser: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: mocks.getCachedAuth }));
vi.mock('./store.server', () => ({
  isPmfSurveyEligibleForUser: mocks.isPmfSurveyEligibleForUser,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.captureError }));

import { resolvePmfSurveyUserId, shouldShowPmfSurvey } from './prompt.server';

const NOW = new Date('2026-11-11T12:00:00.000Z');

describe('PMF prompt eligibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCachedAuth.mockResolvedValue({ userId: 'user-1' });
    mocks.isPmfSurveyEligibleForUser.mockResolvedValue(true);
  });

  it('shows by default with no flag or env override', async () => {
    await expect(shouldShowPmfSurvey({ now: NOW })).resolves.toBe(true);
  });

  it('stays hidden when nobody is signed in', async () => {
    mocks.getCachedAuth.mockResolvedValue({ userId: null });
    await expect(shouldShowPmfSurvey({ now: NOW })).resolves.toBe(false);
    expect(mocks.isPmfSurveyEligibleForUser).not.toHaveBeenCalled();
  });

  it('shows for the signed-in user when the prompt is due', async () => {
    await expect(resolvePmfSurveyUserId({ now: NOW })).resolves.toBe('user-1');
    expect(mocks.isPmfSurveyEligibleForUser).toHaveBeenCalledWith({
      userId: 'user-1',
      now: NOW,
    });
  });

  it('stays hidden when the prompt is not due', async () => {
    mocks.isPmfSurveyEligibleForUser.mockResolvedValue(false);
    await expect(shouldShowPmfSurvey({ now: NOW })).resolves.toBe(false);
  });

  it('never shows to an admin impersonating an artist', async () => {
    mocks.getCachedAuth.mockResolvedValue({
      userId: 'user-1',
      actorUserId: 'admin-1',
    });
    await expect(resolvePmfSurveyUserId({ now: NOW })).resolves.toBeNull();
    expect(mocks.isPmfSurveyEligibleForUser).not.toHaveBeenCalled();
  });

  it('fails closed to no card when the read throws', async () => {
    mocks.isPmfSurveyEligibleForUser.mockRejectedValue(new Error('db down'));
    await expect(shouldShowPmfSurvey({ now: NOW })).resolves.toBe(false);
    expect(mocks.captureError).toHaveBeenCalledOnce();
  });
});
